import http.server
import os
import socketserver
from urllib.parse import urlparse

PORT = 5500

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Override to serve files relative to frontend directory
        return super().translate_path(path)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        # Block dotfiles (like .env, .git)
        for part in path.split("/"):
            if part.startswith(".") and part not in (".", ".."):
                self.send_error(403, "Access denied")
                return
        if path == "/":
            self.path = "/index.html" + ("?" + parsed.query if parsed.query else "")
        elif not path.endswith(".html") and "." not in os.path.basename(path):
            target_file = os.path.join(os.path.dirname(__file__), path.lstrip("/") + ".html")
            if os.path.exists(target_file):
                self.path = "/" + path.lstrip("/") + ".html" + ("?" + parsed.query if parsed.query else "")
        return super().do_GET()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        path = parsed.path
        for part in path.split("/"):
            if part.startswith(".") and part not in (".", ".."):
                self.send_error(403, "Access denied")
                return
        if path == "/":
            self.path = "/index.html" + ("?" + parsed.query if parsed.query else "")
        elif not path.endswith(".html") and "." not in os.path.basename(path):
            target_file = os.path.join(os.path.dirname(__file__), path.lstrip("/") + ".html")
            if os.path.exists(target_file):
                self.path = "/" + path.lstrip("/") + ".html" + ("?" + parsed.query if parsed.query else "")
        return super().do_HEAD()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
        print(f'Serving frontend with no-cache on http://127.0.0.1:{PORT}')
        httpd.serve_forever()
