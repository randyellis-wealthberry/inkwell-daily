import AppKit
import SwiftUI
import WebKit

/// Share a card of an edition: the CLI writes <date>-share.html beside the
/// edition; this renders it off screen at 1200×630, keeps a PNG, and shows a
/// small window to share, copy or save it.
@MainActor
final class ShareWindow: NSObject, WKNavigationDelegate {
    static let size = NSSize(width: 1200, height: 630)

    private var renderer: WKWebView?
    private var window: NSWindow?
    private var pending: ((NSImage?) -> Void)?

    func share(card: URL, png: URL) {
        render(card) { image in
            guard let image else {
                let alert = NSAlert()
                alert.messageText = "Couldn't make the share card"
                alert.informativeText = "Set the edition again with Reset Paper, then try Share."
                alert.runModal()
                return
            }
            if let data = Self.pngData(image) {
                try? FileManager.default.createDirectory(at: png.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? data.write(to: png)
            }
            self.show(image: image, file: png)
        }
    }

    private func render(_ card: URL, done: @escaping (NSImage?) -> Void) {
        guard FileManager.default.fileExists(atPath: card.path) else { return done(nil) }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: NSRect(origin: .zero, size: Self.size), configuration: config)
        view.navigationDelegate = self
        renderer = view
        pending = done
        view.loadFileURL(card, allowingReadAccessTo: card.deletingLastPathComponent())
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Give the web fonts a moment to arrive before the picture is taken.
        webView.evaluateJavaScript("document.fonts.ready.then(() => true)") { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                let config = WKSnapshotConfiguration()
                config.rect = NSRect(origin: .zero, size: Self.size)
                config.snapshotWidth = NSNumber(value: Double(Self.size.width) * 2)
                webView.takeSnapshot(with: config) { image, _ in
                    self.pending?(image)
                    self.pending = nil
                    self.renderer = nil
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        pending?(nil)
        pending = nil
        renderer = nil
    }

    // Only the card's own file and its fonts load; nothing it links to opens.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        let scheme = action.request.url?.scheme ?? ""
        decisionHandler(["file", "https", "data", "about"].contains(scheme) && action.navigationType != .linkActivated ? .allow : .cancel)
    }

    private func show(image: NSImage, file: URL) {
        let view = SharePanel(image: image, file: file)
        if let window {
            window.contentView = NSHostingView(rootView: view)
        } else {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 430), styleMask: [.titled, .closable], backing: .buffered, defer: false)
            w.title = "Share Today's Paper"
            w.isReleasedWhenClosed = false
            w.contentView = NSHostingView(rootView: view)
            w.center()
            window = w
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    static func pngData(_ image: NSImage) -> Data? {
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .png, properties: [:])
    }
}

/// The card, and what to do with it.
struct SharePanel: View {
    let image: NSImage
    let file: URL
    @State private var copied = false

    var body: some View {
        VStack(spacing: 14) {
            Image(nsImage: image)
                .resizable()
                .aspectRatio(1200.0 / 630.0, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .shadow(radius: 4, y: 2)
            Text("Only the headline, the picture and the day's counts. No prompts, commits or mail.")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([file]) }
                Button("Save…") { save() }
                Spacer()
                Button(copied ? "Copied" : "Copy Image") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.writeObjects([image])
                    copied = true
                }
                ShareButton(items: [file])
                    .frame(width: 96, height: 28)
            }
        }
        .padding(18)
        .frame(width: 640)
    }

    private func save() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        panel.nameFieldStringValue = file.lastPathComponent
        if panel.runModal() == .OK, let url = panel.url { try? FileManager.default.copyItem(at: file, to: url) }
    }
}

/// The system share menu (Messages, Mail, AirDrop and the rest), from a button.
struct ShareButton: NSViewRepresentable {
    let items: [Any]

    func makeNSView(context: Context) -> NSButton {
        let button = NSButton(title: "Share…", target: context.coordinator, action: #selector(Coordinator.open(_:)))
        button.bezelStyle = .push
        button.keyEquivalent = "\r"
        return button
    }

    func updateNSView(_ view: NSButton, context: Context) { context.coordinator.items = items }
    func makeCoordinator() -> Coordinator { Coordinator(items: items) }

    @MainActor
    final class Coordinator: NSObject {
        var items: [Any]
        init(items: [Any]) { self.items = items }
        @objc func open(_ sender: NSButton) {
            NSSharingServicePicker(items: items).show(relativeTo: sender.bounds, of: sender, preferredEdge: .minY)
        }
    }
}
