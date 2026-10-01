"""Serve only on loopback; avoid other apps occupying the old 8765 port."""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser


class LocalServer(ThreadingHTTPServer):
    # Windows must not let two local servers bind the same port.
    allow_reuse_address = False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=8871)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(root))
    server = None
    for port in range(args.port, args.port + 20):
        try:
            server = LocalServer(('127.0.0.1', port), handler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit('No free local port. Close an earlier server and retry.')
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'3D Studio: {url}  (Ctrl+C to stop)', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
