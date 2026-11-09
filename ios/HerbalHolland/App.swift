// Herbal Holland for iPhone: the shop and Rewards web app (https://shop.herbalholland.com/club) in a native shell.
// Everything the customer sees is the web app; this shell adds what a browser tab can't: the installed-app layout
// (the web app's own tab bar, via html.native-app), pull to refresh, an offline screen, links to other sites opening
// in Safari, and universal links opening in the app.
import SwiftUI
import WebKit

let site = URL(string: "https://shop.herbalholland.com")!
let home = site.appendingPathComponent("club")

@main
struct HerbalHollandApp: App {
    @StateObject private var shell = Shell()

    var body: some Scene {
        WindowGroup {
            ZStack {
                Color("Ink").ignoresSafeArea()
                WebView(web: shell.web).ignoresSafeArea(edges: .bottom)
                if shell.offline { OfflineView(retry: shell.retry) }
            }
            .preferredColorScheme(.dark)
            .onOpenURL(perform: shell.open)
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { a in a.webpageURL.map(shell.open) }
        }
    }
}

struct WebView: UIViewRepresentable {
    let web: WKWebView
    func makeUIView(context: Context) -> WKWebView { web }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

struct OfflineView: View {
    let retry: () -> Void
    var body: some View {
        VStack(spacing: 16) {
            Image("LaunchMark").resizable().frame(width: 96, height: 96)
            Text("You're offline").font(.title2.weight(.semibold))
            Text("Check your connection and try again.").foregroundStyle(.secondary)
            Button("Try again", action: retry).buttonStyle(.borderedProminent).tint(.orange)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("Ink"))
    }
}

/// Runs before any page script: the web app treats the page as the installed app when `navigator.standalone` is true
/// (src/app/app/handshake.tsx, src/lib/install.ts) and styles it as one when <html> has `native-app`
/// (the `app:` variant in src/app/globals.css). A WKWebView never matches `display-mode: standalone` on its own.
private let installedApp = """
Object.defineProperty(navigator, "standalone", { get: () => true });
(function mark() {
  if (document.documentElement) document.documentElement.classList.add("native-app");
  else document.addEventListener("readystatechange", mark, { once: true });
})();
"""

final class Shell: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    @Published var offline = false
    let web: WKWebView

    override init() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "Mobile/15E148 HerbalHollandApp/1"
        config.userContentController.addUserScript(WKUserScript(source: installedApp, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config)
        super.init()
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.isOpaque = false
        web.backgroundColor = UIColor(named: "Ink")
        web.scrollView.backgroundColor = UIColor(named: "Ink")
        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pulled(_:)), for: .valueChanged)
        web.scrollView.refreshControl = refresh
        web.load(URLRequest(url: home))
    }

    @objc private func pulled(_ control: UIRefreshControl) {
        web.reload()
        control.endRefreshing()
    }

    func retry() {
        offline = false
        if web.url == nil { web.load(URLRequest(url: home)) } else { web.reload() }
    }

    /// A universal link (once apple-app-site-association lists the app): our pages open here.
    func open(_ url: URL) {
        if url.host == site.host { web.load(URLRequest(url: url)) }
    }

    // Our site stays in the app, and so do payment redirects (they are not link taps). A tapped link to another site,
    // a new-window link, or a tel:/mailto:/WhatsApp link goes to the system.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let web = url.scheme == "https" || url.scheme == "http"
        let ours = url.host == site.host
        if !web && !["about", "blob", "data"].contains(url.scheme ?? "") {
            UIApplication.shared.open(url)
            return decisionHandler(.cancel)
        }
        if web && !ours && action.navigationType == .linkActivated {
            UIApplication.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.host == site.host { webView.load(action.request) } else { UIApplication.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { offline = false }

    private func failed(_ error: Error) {
        let code = (error as NSError).code
        let network = [NSURLErrorNotConnectedToInternet, NSURLErrorTimedOut, NSURLErrorNetworkConnectionLost, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed]
        if (error as NSError).domain == NSURLErrorDomain && network.contains(code) { offline = true }
    }

    // A white screen after iOS reclaims the web content's memory: load the page again.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}
