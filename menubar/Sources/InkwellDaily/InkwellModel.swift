import AppKit
import Foundation
import InkwellCore
import Observation
import ServiceManagement

struct InkwellTheme: Identifiable, Sendable, Hashable {
    let id: String
    let name: String

    static let all: [InkwellTheme] = [
        .init(id: "auto", name: "Auto"),
        .init(id: "firstlight", name: "First Light"),
        .init(id: "sunday", name: "Sunday Paper"),
        .init(id: "nocturne", name: "Nocturne"),
        .init(id: "sepia", name: "Sepia"),
        .init(id: "gilt", name: "Gilt"),
        .init(id: "century", name: "Century"),
    ]
}

@Observable
@MainActor
final class InkwellModel {
    private(set) var status: InkwellStatus = .empty
    private(set) var cliURL: URL?
    private(set) var isBuilding = false
    private(set) var lastError: String?

    var hour = 5
    var notify = true
    var theme = "auto"
    var launchAtLogin = false
    var loginItemError: String?

    @ObservationIgnored private var cli: InkwellCLI?
    @ObservationIgnored private var refreshTask: Task<Void, Never>?
    @ObservationIgnored var onStatusChange: (() -> Void)?

    init() {
        let url = Self.resolveCLI()
        cliURL = url
        cli = url.map(InkwellCLI.init(url:))

        refresh()
        refreshConfig()
        refreshLaunchAtLogin()
        startRefreshing()
        registerAtLoginIfInstalled()
    }

    private static func resolveCLI() -> URL? {
        if let saved = UserDefaults.standard.string(forKey: "InkwellCLIPath"),
           FileManager.default.isExecutableFile(atPath: saved) {
            return URL(fileURLWithPath: saved)
        }
        return InkwellPaths.locateCLI()
    }

    func refresh() {
        status = InkwellStatus.load()
        onStatusChange?()
    }

    func refreshConfig() {
        let config = ConfigStore.read(InkwellPaths.configFile())
        if let value = config["hour"] as? NSNumber {
            hour = value.intValue
        }
        if let value = config["notify"] as? Bool {
            notify = value
        }
        if let value = config["theme"] as? String, !value.isEmpty {
            theme = value
        }
    }

    func refreshLaunchAtLogin() {
        launchAtLogin = SMAppService.mainApp.status == .enabled
    }

    private func startRefreshing() {
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard let self else { return }
                self.refresh()
                self.refreshConfig()
            }
        }
    }

    private func registerAtLoginIfInstalled() {
        // Only the installed app registers itself; a build run from dist or
        // ~/Applications would register a path that later disappears.
        guard Bundle.main.bundleURL.path.hasPrefix("/Applications/") else { return }
        guard !UserDefaults.standard.bool(forKey: "InkwellDidRegisterLoginItem") else { return }
        UserDefaults.standard.set(true, forKey: "InkwellDidRegisterLoginItem")
        try? SMAppService.mainApp.register()
        refreshLaunchAtLogin()
    }

    private func run(
        _ arguments: [String],
        completion: (@MainActor (Result<String, Error>) -> Void)? = nil
    ) {
        guard let cli else {
            lastError = "inkwell-daily was not found. Choose its location in Settings."
            completion?(.failure(InkwellCLIError(message: lastError ?? "")))
            return
        }

        cli.run(arguments) { result in
            switch result {
            case .success:
                self.lastError = nil
            case .failure(let error):
                self.lastError = error.localizedDescription
            }
            completion?(result)
        }
    }

    func openPaper() {
        run(["open"]) { _ in self.refresh() }
    }

    func buildNow() {
        guard !isBuilding else { return }
        isBuilding = true
        lastError = nil
        run(["build"]) { result in
            self.isBuilding = false
            if case .failure = result {
                // lastError is already set by run.
            }
            self.refresh()
        }
    }

    func openIndex() {
        run(["index"])
    }

    func setTheme(_ id: String) {
        guard id != theme else { return }
        theme = id
        run(["theme", id]) { _ in
            self.refreshConfig()
        }
    }

    func setHour(_ value: Int) {
        guard value != hour else { return }
        hour = value
        run(["install", "--hour", String(value)]) { _ in
            self.refreshConfig()
        }
    }

    func setNotify(_ value: Bool) {
        notify = value
        do {
            try ConfigStore.set("notify", value, at: InkwellPaths.configFile())
        } catch {
            lastError = error.localizedDescription
            refreshConfig()
        }
    }

    func setLaunchAtLogin(_ value: Bool) {
        do {
            if value {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            loginItemError = nil
        } catch {
            loginItemError = error.localizedDescription
        }
        refreshLaunchAtLogin()
    }

    func chooseCLI() {
        let panel = NSOpenPanel()
        panel.message = "Choose the inkwell-daily command"
        panel.prompt = "Choose"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false

        guard panel.runModal() == .OK, let url = panel.url,
              FileManager.default.isExecutableFile(atPath: url.path) else { return }

        UserDefaults.standard.set(url.path, forKey: "InkwellCLIPath")
        cliURL = url
        cli = InkwellCLI(url: url)
        lastError = nil
    }

    func openConfig() {
        NSWorkspace.shared.open(InkwellPaths.configFile())
    }

    func revealData() {
        NSWorkspace.shared.activateFileViewerSelecting([InkwellPaths.dataDirectory()])
    }
}
