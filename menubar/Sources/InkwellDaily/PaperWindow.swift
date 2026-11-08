import AppKit
import InkwellCore
import SwiftUI
import WebKit

/// The paper in its own window instead of a browser tab: one window, reused.
/// It takes theme and font changes without reloading, reloads when a new
/// edition is set, and handles the portrait's good / bad buttons itself, so
/// no "Open Inkwell Daily?" prompt appears.
@MainActor
final class PaperWindow: NSObject, WKNavigationDelegate, NSWindowDelegate {
    private let window: NSWindow
    private let webView: WKWebView
    private var current: URL?
    var onRate: ((PortraitRating) -> Void)?
    var onClose: (() -> Void)?
    var onShare: ((ShareRequest) -> Void)?
    var onDesk: ((DeskRequest?) -> Void)?

    init(bar: PaperBar) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsMagnification = true

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1100, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        super.init()
        window.title = "Inkwell Daily"
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 420, height: 400)
        // The theme bar on top, the paper filling the rest.
        let barView = NSHostingView(rootView: bar)
        let stack = NSStackView(views: [barView, webView])
        stack.orientation = .vertical
        stack.spacing = 0
        stack.setHuggingPriority(.defaultHigh, for: .vertical)
        barView.setContentHuggingPriority(.required, for: .vertical)
        webView.setContentHuggingPriority(.defaultLow, for: .vertical)
        window.contentView = stack
        window.delegate = self
        window.setFrameAutosaveName("InkwellPaper")
        if !window.setFrameUsingName("InkwellPaper") { window.center() }
        webView.navigationDelegate = self
    }

    var isVisible: Bool { window.isVisible }

    func show(_ file: URL) {
        current = file
        // Back issues sit beside it, so the whole editions folder is readable.
        webView.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    /// A new edition was set: show it if the window is open.
    func reload(_ file: URL?) {
        guard window.isVisible else { return }
        if let file, file != current { show(file) } else { webView.reloadFromOrigin() }
    }

    /// The new theme and font, applied to the page on screen. The file is
    /// restyled too, so a reload or the browser shows the same.
    func apply(style: [String: Any]) {
        guard window.isVisible,
              let data = try? JSONSerialization.data(withJSONObject: style),
              let json = String(data: data, encoding: .utf8) else { return }
        let script = """
        (function (s) {
          var root = document.documentElement.style;
          for (var k in s.vars) root.setProperty(k, s.vars[k]);
          if (s.look) document.documentElement.setAttribute("data-style", s.look);
          var link = document.querySelector('link[rel="stylesheet"]');
          if (link && s.fontUrl) link.href = s.fontUrl;
        })(\(json));
        """
        webView.evaluateJavaScript(script)
    }

    // MARK: - Navigation

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        switch url.scheme {
        case "inkwell-daily":
            // The rating buttons; the same strict check as the URL scheme.
            if let rating = PortraitRating(url: url) { onRate?(rating) }
            if let request = ShareRequest(url: url) { onShare?(request) }
            if let request = DeskRequest(url: url) { onDesk?(request) }
            else if url.host == "desks" { onDesk?(nil) }
            decisionHandler(.cancel)
        case "file":
            // Only the editions folder; anything else goes nowhere.
            let folder = current?.deletingLastPathComponent().standardizedFileURL.path ?? ""
            let allowed = !folder.isEmpty && url.standardizedFileURL.path.hasPrefix(folder + "/")
            if allowed && action.targetFrame?.isMainFrame != false { current = url }
            decisionHandler(allowed ? .allow : .cancel)
        case "https", "http":
            // The page's fonts load; links a person clicks open in the browser.
            if action.navigationType == .linkActivated {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
        case "data", "about":
            decisionHandler(.allow)
        default:
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        window.title = webView.title ?? "Inkwell Daily"
    }

    // A menu bar app goes back to having no Dock icon when its window closes.
    func windowWillClose(_ notification: Notification) {
        onClose?()
        NSApp.setActivationPolicy(.accessory)
    }
}
