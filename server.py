#!/usr/bin/env python3
import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    # Force working directory to project root
    os.chdir(DIRECTORY)
    
    handler = MyHTTPRequestHandler
    
    # Enable socket re-use to avoid 'Address already in use' errors
    socketserver.TCPServer.allow_reuse_address = True
    
    try:
        with socketserver.TCPServer(("", PORT), handler) as httpd:
            print("==================================================================")
            print("   نظام إدارة الرواتب والأجور - تم تشغيل خادم التطوير بنجاح!   ")
            print("==================================================================")
            print(f"  الموقع الإلكتروني يعمل محلياً على الرابط: http://localhost:{PORT}")
            print("  لإغلاق الخادم، اضغط على Ctrl + C في موجه الأوامر (Terminal)")
            print("==================================================================")
            
            # Automatically open user's default browser
            webbrowser.open(f"http://localhost:{PORT}")
            
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[!] تم إيقاف الخادم المالي بنجاح.")
        sys.exit(0)
    except Exception as e:
        print(f"\n[-] حدث خطأ أثناء تشغيل الخادم: {e}")
        print("[*] يرجى التأكد من عدم استخدام المنفذ 8000 من قبل تطبيق آخر.")
        sys.exit(1)

if __name__ == "__main__":
    start_server()
