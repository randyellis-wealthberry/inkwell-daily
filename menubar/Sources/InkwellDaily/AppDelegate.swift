import AppKit
import InkwellCore
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let model = InkwellModel()
    private var statusItem: NSStatusItem?
    private var settingsWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        buildMainMenu()

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            button.image = InkwellGlyph.menuBar(unread: model.status.unread)
            button.image?.isTemplate = true
            button.toolTip = "Inkwell Daily"
            button.setAccessibilityLabel("Inkwell Daily")
        }
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        statusItem = item

        model.onStatusChange = { [weak self] in
            self?.updateStatusItem()
        }
        rebuildMenu()
    }

    func menuWillOpen(_ menu: NSMenu) {
        model.refresh()
        model.refreshConfig()
        model.refreshLaunchAtLogin()
        rebuildMenu()
    }

    private func updateStatusItem() {
        statusItem?.button?.image = InkwellGlyph.menuBar(unread: model.status.unread)
        statusItem?.button?.image?.isTemplate = true
    }

    private func rebuildMenu() {
        guard let menu = statusItem?.menu else { return }
        menu.removeAllItems()

        let date = NSMenuItem(
            title: model.status.latest.map { EditionDate.display($0.date) } ?? "No edition yet",
            action: nil,
            keyEquivalent: ""
        )
        date.isEnabled = false
        menu.addItem(date)

        if let latest = model.status.latest {
            let headline = latest.headline.isEmpty ? latest.title : latest.headline
            let item = NSMenuItem(title: short(headline), action: nil, keyEquivalent: "")
            item.isEnabled = false
            item.toolTip = headline
            menu.addItem(item)
        }

        menu.addItem(.separator())

        let open = NSMenuItem(title: "Open Today's Paper", action: #selector(openPaper), keyEquivalent: "o")
        open.target = self
        open.isEnabled = model.status.latest != nil && !model.isBuilding
        menu.addItem(open)

        let build = NSMenuItem(
            title: model.isBuilding ? "Setting Yesterday's Edition…" : "Set Yesterday's Edition Now",
            action: #selector(buildNow),
            keyEquivalent: "b"
        )
        build.target = self
        build.isEnabled = !model.isBuilding && model.cliURL != nil
        menu.addItem(build)

        let index = NSMenuItem(title: "Open Every Edition", action: #selector(openIndex), keyEquivalent: "")
        index.target = self
        index.isEnabled = model.status.editionCount > 0 && model.cliURL != nil
        menu.addItem(index)

        menu.addItem(.separator())

        let themeItem = NSMenuItem(title: "Theme", action: nil, keyEquivalent: "")
        let themeMenu = NSMenu(title: "Theme")
        for theme in InkwellTheme.all {
            let item = NSMenuItem(title: theme.name, action: #selector(setTheme(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = theme.id
            item.state = model.theme == theme.id ? .on : .off
            themeMenu.addItem(item)
        }
        themeItem.submenu = themeMenu
        menu.addItem(themeItem)

        let settings = NSMenuItem(title: "Settings…", action: #selector(openSettings), keyEquivalent: ",")
        settings.target = self
        menu.addItem(settings)

        let login = NSMenuItem(title: "Launch at Login", action: #selector(toggleLaunchAtLogin), keyEquivalent: "")
        login.target = self
        login.state = model.launchAtLogin ? .on : .off
        menu.addItem(login)

        if let error = model.lastError {
            menu.addItem(.separator())
            let item = NSMenuItem(title: "Error: \(short(error))", action: nil, keyEquivalent: "")
            item.isEnabled = false
            item.toolTip = error
            menu.addItem(item)
        }

        if model.cliURL == nil {
            menu.addItem(.separator())
            let locate = NSMenuItem(title: "Locate inkwell-daily Command…", action: #selector(chooseCLI), keyEquivalent: "")
            locate.target = self
            menu.addItem(locate)
        }

        menu.addItem(.separator())

        let about = NSMenuItem(title: "About Inkwell Daily", action: #selector(showAbout), keyEquivalent: "")
        about.target = self
        menu.addItem(about)

        let quit = NSMenuItem(title: "Quit Inkwell Daily", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
    }

    private func buildMainMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu(title: "Inkwell Daily")
        appMenu.addItem(withTitle: "About Inkwell Daily", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(.separator())
        let settings = NSMenuItem(title: "Settings…", action: #selector(openSettings), keyEquivalent: ",")
        settings.target = self
        appMenu.addItem(settings)
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Inkwell Daily", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Inkwell Daily", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        let viewMenuItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        let fullScreen = NSMenuItem(title: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.control, .command]
        viewMenu.addItem(fullScreen)
        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowMenu.addItem(.separator())
        windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        let helpMenuItem = NSMenuItem()
        let helpMenu = NSMenu(title: "Help")
        let help = NSMenuItem(title: "Inkwell Daily Help", action: #selector(openHelp), keyEquivalent: "?")
        help.target = self
        helpMenu.addItem(help)
        helpMenuItem.submenu = helpMenu
        mainMenu.addItem(helpMenuItem)

        NSApp.mainMenu = mainMenu
        NSApp.windowsMenu = windowMenu
    }

    private func short(_ text: String) -> String {
        let clean = text.replacingOccurrences(of: "\n", with: " ")
        return clean.count > 90 ? String(clean.prefix(90)) + "…" : clean
    }

    @objc private func openPaper() {
        model.openPaper()
        rebuildMenu()
    }

    @objc private func buildNow() {
        model.buildNow()
        rebuildMenu()
    }

    @objc private func openIndex() {
        model.openIndex()
    }

    @objc private func setTheme(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        model.setTheme(id)
        rebuildMenu()
    }

    @objc private func toggleLaunchAtLogin() {
        model.setLaunchAtLogin(!model.launchAtLogin)
        rebuildMenu()
    }

    @objc private func chooseCLI() {
        model.chooseCLI()
        rebuildMenu()
    }

    @objc private func openSettings() {
        if settingsWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 500, height: 620),
                styleMask: [.titled, .closable, .miniaturizable],
                backing: .buffered,
                defer: false
            )
            window.title = "Inkwell Daily Settings"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: SettingsView(model: model))
            window.center()
            settingsWindow = window
        }
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow?.makeKeyAndOrderFront(nil)
    }

    @objc private func showAbout() {
        NSApp.orderFrontStandardAboutPanel(nil)
    }

    @objc private func openHelp() {
        guard let url = URL(string: "https://github.com/randyellis-wealthberry/inkwell-daily#readme") else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
