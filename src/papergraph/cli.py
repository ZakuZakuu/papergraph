"""Command-line entrypoints for papergraph.

Thin wrappers around the format-only validator (``papergraph.validator.validate``)
and the (Issue 04) static viewer. This module owns *all* the file/argv/exit-code
concerns that the validator deliberately avoids.

Subcommands
-----------
``validate`` load inputs, run ``validate``, print a human-readable summary, and
             optionally write the JSON report.
``render``   validate first; only if valid, emit a static viewer directory. Issue
             04 replaces the stub viewer produced here.
``serve``    validate + render, then serve the render directory over the stdlib
             ``http.server`` (fail-closed: an invalid graph never gets served).
``build``    ``validate`` then ``render`` in one step.

Exit codes (exact, load-bearing for callers/CI)
------------------------------------------------
``0`` graph valid · ``1`` graph invalid (validation failed) · ``2`` file / arg /
env error (missing file, bad JSON, bad args). Exceptions are mapped to these
codes; a stack trace is never the primary output.

Boundary discipline: inputs are never mutated and there is no auto-fix. "Passes
the validator" means format-only conformance, never semantic correctness.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any, Sequence

from papergraph._resources import read_viewer_asset
from papergraph.report import LintReport
from papergraph.source import Source
from papergraph.validator import validate

PROG = "papergraph"

# Exit codes -- keep these exact.
EXIT_OK = 0
EXIT_INVALID = 1
EXIT_USAGE = 2

# Layout of the render/viewer directory. Issue 04 drops the real viewer assets
# into the same directory (replacing index.html and reading from ``data/``); the
# data filenames and manifest below are the contract it consumes.
VIEWER_DATA_DIR = "data"
VIEWER_GRAPH_FILE = "graph.json"
VIEWER_COVERAGE_FILE = "coverage-plan.json"
VIEWER_SOURCE_FILE = "source.json"
VIEWER_INDEX_FILE = "index.html"
VIEWER_STANDALONE_FILE = "index.standalone.html"
VIEWER_APP_FILE = "app.js"
VIEWER_STYLES_FILE = "styles.css"
VIEWER_MANIFEST_FILE = "manifest.json"

# The real viewer assets (Issue 04) ship inside the package as data files, read
# via importlib.resources (papergraph._resources) so a .pyz zipapp works too.


class CliError(Exception):
    """A user-facing error carrying the exit code it should map to.

    ``code`` is one of the module ``EXIT_*`` constants. ``report`` is attached
    for the invalid-graph case so the caller can print the lint summary.
    """

    def __init__(self, code: int, message: str, *, report: LintReport | None = None):
        super().__init__(message)
        self.code = code
        self.report = report


# --- loading (all file/JSON faults become EXIT_USAGE) -------------------------


def _load_json(path_str: str, what: str) -> Any:
    path = Path(path_str)
    if not path.exists():
        raise CliError(EXIT_USAGE, f"{what} file not found: {path_str}")
    if not path.is_file():
        raise CliError(EXIT_USAGE, f"{what} path is not a file: {path_str}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CliError(EXIT_USAGE, f"{what} is not valid JSON ({path_str}): {exc}") from exc
    except OSError as exc:
        raise CliError(EXIT_USAGE, f"cannot read {what} ({path_str}): {exc}") from exc


def _load_source(path_str: str | None) -> Source | None:
    if path_str is None:
        return None
    path = Path(path_str)
    if not path.exists():
        raise CliError(EXIT_USAGE, f"source file not found: {path_str}")
    try:
        return Source.from_path(path)
    except json.JSONDecodeError as exc:
        raise CliError(EXIT_USAGE, f"source is not valid JSON ({path_str}): {exc}") from exc
    except OSError as exc:
        raise CliError(EXIT_USAGE, f"cannot read source ({path_str}): {exc}") from exc


def _load_inputs(args: argparse.Namespace) -> tuple[Any, Any, Source | None]:
    """Load (graph, coverage, source) from parsed args. Never mutates anything."""
    graph = _load_json(args.graph, "graph")
    coverage = _load_json(args.coverage, "coverage") if getattr(args, "coverage", None) else None
    source = _load_source(getattr(args, "source", None))
    return graph, coverage, source


# --- human-readable summary ---------------------------------------------------


def format_summary(args: argparse.Namespace, report: LintReport) -> str:
    lines = [f"{PROG} validate"]
    lines.append(f"  graph:    {args.graph}")
    lines.append(f"  coverage: {getattr(args, 'coverage', None) or '(none)'}")
    lines.append(f"  source:   {getattr(args, 'source', None) or '(none)'}")
    lines.append("")
    if report.valid:
        lines.append("VALID (format-only) - 0 errors")
        lines.append("Note: format conformance only; NOT a judgement of semantic correctness.")
    else:
        n = report.error_count
        lines.append(f"INVALID - {n} error{'s' if n != 1 else ''}:")
        for issue in report.errors:
            lines.append(f"  [{issue.layer}/{issue.code}] {issue.path}: {issue.message}")
    return "\n".join(lines)


# --- validate + render core (unit-testable, no argv/socket) -------------------


def validate_inputs(graph: Any, coverage: Any, source: Source | None) -> LintReport:
    """Run the format validator. Never mutates inputs."""
    return validate(graph, coverage, source)


def _require_valid(graph: Any, coverage: Any, source: Source | None) -> LintReport:
    """Return the report if valid, else raise ``CliError(EXIT_INVALID)``.

    This is the fail-closed gate shared by render/serve/build: nothing downstream
    (no output dir, no server) is produced for an invalid graph.
    """
    report = validate_inputs(graph, coverage, source)
    if not report.valid:
        raise CliError(EXIT_INVALID, "graph is invalid; refusing to render", report=report)
    return report


def _read_viewer_asset(name: str) -> str:
    """Read one bundled viewer source file (index.html / app.js / styles.css)."""
    return read_viewer_asset(name)


def _js_safe(payload: str) -> str:
    """Make a JSON string safe to embed inside an inline ``<script>`` element.

    Only the ``</`` and U+2028/U+2029 sequences can break out of a script tag or
    a JS string literal; escaping them keeps the document self-contained.
    """
    return (
        payload.replace("</", "<\\/")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def _standalone_html(
    graph: Any, coverage: Any, source_json: Any
) -> str:
    """Build a single self-contained HTML file (no server, no external refs).

    Same viewer code as the served build, but ``styles.css`` is inlined into a
    ``<style>`` block and ``app.js`` is preceded by an inline
    ``window.__PAPERGRAPH_DATA__`` payload (which the app prefers over fetching
    ``manifest.json``). ``source_json`` is the raw normalized-paper JSON (or
    ``None``). Strictly no CDN/font/remote references.
    """
    html = _read_viewer_asset(VIEWER_INDEX_FILE)
    styles = _read_viewer_asset(VIEWER_STYLES_FILE)
    app = _read_viewer_asset(VIEWER_APP_FILE)

    data = {"graph": graph, "coverage": coverage, "source": source_json}
    data_json = _js_safe(json.dumps(data, ensure_ascii=False))

    # Inline the stylesheet in place of the external <link>.
    html = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        "<style>\n" + styles + "\n</style>",
    )
    # Inline the data payload + app code in place of the external <script src>.
    inline_scripts = (
        "<script>window.__PAPERGRAPH_DATA__ = " + data_json + ";</script>\n"
        "  <script>\n" + app + "\n</script>"
    )
    html = html.replace('<script src="app.js"></script>', inline_scripts)
    return html


def render_to_dir(
    graph: Any,
    coverage: Any,
    source: Source | None,
    out_dir: str | Path,
    *,
    graph_path: str,
    coverage_path: str | None,
    source_path: str | None,
) -> Path:
    """Validate then materialise the (stub) viewer directory; return its path.

    Fail-closed: raises ``CliError(EXIT_INVALID)`` *before* creating ``out_dir``
    if the graph is invalid, so no partial/successful artifact is ever left
    behind for a bad graph. Copies the validated inputs verbatim (never mutates).
    """
    _require_valid(graph, coverage, source)

    out = Path(out_dir)
    data_dir = out / VIEWER_DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)

    data_files: dict[str, str] = {"graph": VIEWER_GRAPH_FILE}
    shutil.copyfile(graph_path, data_dir / VIEWER_GRAPH_FILE)
    if coverage_path is not None:
        shutil.copyfile(coverage_path, data_dir / VIEWER_COVERAGE_FILE)
        data_files["coverage"] = VIEWER_COVERAGE_FILE
    if source_path is not None:
        shutil.copyfile(source_path, data_dir / VIEWER_SOURCE_FILE)
        data_files["source"] = VIEWER_SOURCE_FILE

    manifest = {
        "generator": f"{PROG} render",
        "stub": False,
        "validated": True,
        "validation": "format-only",
        "format_version": (graph or {}).get("format_version") if isinstance(graph, dict) else None,
        "data_dir": VIEWER_DATA_DIR,
        "data_files": data_files,
    }
    (out / VIEWER_MANIFEST_FILE).write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    # Install the real viewer assets (Issue 04) verbatim from the package. The
    # served build reads ./data/ per ./manifest.json via fetch. Read-then-write
    # (not shutil.copyfile) since the source may live inside a .pyz zip member.
    for name in (VIEWER_INDEX_FILE, VIEWER_APP_FILE, VIEWER_STYLES_FILE):
        (out / name).write_text(_read_viewer_asset(name), encoding="utf-8")

    # Also emit a single self-contained file with the data inlined (no server,
    # no external requests) suitable for sharing on its own. The viewer reads
    # evidence spans straight from the graph and never loads the source catalog
    # at runtime (see loadData/fetch in app.js), so the standalone inlines only
    # the runtime-consumed graph + coverage. Inlining the (large) source catalog
    # would add no behaviour and would embed the paper's own reference URLs as
    # inert text; ``data/source.json`` remains available in the served build for
    # provenance. Result: the standalone stays lean and provably free of any
    # remote reference.
    (out / VIEWER_STANDALONE_FILE).write_text(
        _standalone_html(graph, coverage, None), encoding="utf-8"
    )
    return out


def resolve_serve_dir(args: argparse.Namespace) -> Path:
    """Load + validate + render, returning the directory to serve (or raising).

    Factored out so the "validate-then-serve" gate is unit-testable without a
    live socket.
    """
    graph, coverage, source = _load_inputs(args)
    out_dir = getattr(args, "out", None) or (Path(args.serve_root) if getattr(args, "serve_root", None) else None)
    if out_dir is None:
        raise CliError(EXIT_USAGE, "internal: serve requires a render directory")
    return render_to_dir(
        graph, coverage, source, out_dir,
        graph_path=args.graph,
        coverage_path=getattr(args, "coverage", None),
        source_path=getattr(args, "source", None),
    )


# --- subcommand handlers ------------------------------------------------------


def _cmd_validate(args: argparse.Namespace) -> int:
    graph, coverage, source = _load_inputs(args)
    report = validate_inputs(graph, coverage, source)
    print(format_summary(args, report))
    if getattr(args, "report", None):
        try:
            report.write(args.report)
        except OSError as exc:
            raise CliError(EXIT_USAGE, f"cannot write report ({args.report}): {exc}") from exc
        print(f"report written: {args.report}")
    return EXIT_OK if report.valid else EXIT_INVALID


def _cmd_render(args: argparse.Namespace) -> int:
    graph, coverage, source = _load_inputs(args)
    out = render_to_dir(
        graph, coverage, source, args.out,
        graph_path=args.graph,
        coverage_path=getattr(args, "coverage", None),
        source_path=getattr(args, "source", None),
    )
    print(
        f"{PROG} render\n  out: {out}\n"
        f"  VALID (format-only) - viewer written "
        f"({VIEWER_INDEX_FILE}, {VIEWER_APP_FILE}, {VIEWER_STYLES_FILE}, "
        f"{VIEWER_STANDALONE_FILE}, {VIEWER_MANIFEST_FILE}, {VIEWER_DATA_DIR}/)."
    )
    return EXIT_OK


def _cmd_build(args: argparse.Namespace) -> int:
    # build == validate then render, in one step.
    return _cmd_render(args)


def _cmd_serve(args: argparse.Namespace) -> int:
    import http.server
    import tempfile

    if getattr(args, "out", None) is None:
        args.serve_root = tempfile.mkdtemp(prefix="papergraph-serve-")
    serve_dir = resolve_serve_dir(args)

    handler = _directory_handler(str(serve_dir))
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as httpd:
        print(f"{PROG} serve: http://127.0.0.1:{args.port}/ (root: {serve_dir}) - Ctrl-C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped.")
    return EXIT_OK


def _directory_handler(directory: str):
    import functools
    import http.server

    return functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)


# --- argument parser ----------------------------------------------------------


def _add_common_io(sub: argparse.ArgumentParser, *, source_required: bool = False) -> None:
    sub.add_argument("--graph", required=True, help="path to graph.json (paper-evidence-graph/0.2)")
    sub.add_argument("--coverage", default=None, help="path to coverage-plan.json (optional)")
    sub.add_argument(
        "--source", default=None, required=source_required,
        help="path to the authoritative normalized-paper.json (enables quote/span checks)",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROG,
        description="Format-only validator + static viewer for paper evidence graphs.",
    )
    subs = parser.add_subparsers(dest="command", required=True, metavar="{validate,render,serve,build}")

    p_validate = subs.add_parser("validate", help="validate a graph and print a summary")
    _add_common_io(p_validate)
    p_validate.add_argument("--report", default=None, help="write the JSON lint report to this path")
    p_validate.set_defaults(func=_cmd_validate)

    p_render = subs.add_parser("render", help="validate then emit a (stub) static viewer directory")
    _add_common_io(p_render)
    p_render.add_argument("--out", required=True, help="output viewer directory")
    p_render.set_defaults(func=_cmd_render)

    p_build = subs.add_parser("build", help="validate + render in one step")
    _add_common_io(p_build)
    p_build.add_argument("--out", required=True, help="output viewer directory")
    p_build.set_defaults(func=_cmd_build)

    p_serve = subs.add_parser("serve", help="validate + render, then serve locally")
    _add_common_io(p_serve)
    p_serve.add_argument("--out", default=None, help="render directory to serve (default: a temp dir)")
    p_serve.add_argument("--port", type=int, default=5839, help="port to serve on (default: 5839)")
    p_serve.set_defaults(func=_cmd_serve)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint. Returns the process exit code (does not call sys.exit).

    ``0`` valid · ``1`` graph invalid · ``2`` file/arg/env error.
    """
    parser = build_parser()
    try:
        args = parser.parse_args(list(sys.argv[1:] if argv is None else argv))
    except SystemExit as exc:  # argparse uses code 2 for usage errors -> our EXIT_USAGE
        code = exc.code
        return code if isinstance(code, int) else EXIT_USAGE

    try:
        return args.func(args)
    except CliError as exc:
        if exc.report is not None:
            print(format_summary(args, exc.report))
        print(f"{PROG}: error: {exc}", file=sys.stderr)
        return exc.code


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
