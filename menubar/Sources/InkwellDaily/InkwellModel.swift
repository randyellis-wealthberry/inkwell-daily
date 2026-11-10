import AppKit
import Foundation
import InkwellCore
import Observation
import ServiceManagement
import UniformTypeIdentifiers

struct InkwellTheme: Identifiable, Sendable, Hashable {
    let id: String
    let name: String

    static let all: [InkwellTheme] = [
        .init(id: "milestone", name: "Auto-advance"),
        .init(id: "auto", name: "Auto"),
        .init(id: "firstlight", name: "First Light"),
        .init(id: "sunday", name: "Sunday Paper"),
        .init(id: "nocturne", name: "Nocturne"),
        .init(id: "sepia", name: "Sepia"),
        .init(id: "gilt", name: "Gilt"),
        .init(id: "century", name: "Century"),
    ]
}

struct DeskSettings: Sendable, Equatable {
    var data = "composio"
    var model = "inkwell"
    var proxyUrl = "http://127.0.0.1:8787"
    var license = ""
}

/// The paper's looks: `inkwell-daily style`.
struct PaperLook: Identifiable, Sendable, Hashable {
    let id: String
    let name: String

    static let all: [PaperLook] = [
        .init(id: "table", name: "On the table"),
        .init(id: "sky", name: "In the sky"),
        .init(id: "space", name: "Zero gravity"),
        .init(id: "nomad", name: "Digital nomad"),
        .init(id: "overlook", name: "View overlooking"),
        .init(id: "tropical", name: "Tropical landscape"),
        .init(id: "flat", name: "Flat"),
    ]
}

/// The type pairings `inkwell-daily font` knows; lib/fonts.js has the faces.
struct InkwellFont: Identifiable, Sendable, Hashable {
    let id: String
    let name: String

    static let all: [InkwellFont] = [
        .init(id: "inkwell", name: "Inkwell"),
        .init(id: "broadsheet", name: "Broadsheet"),
        .init(id: "gazette", name: "Gazette"),
        .init(id: "modern", name: "Modern"),
        .init(id: "bodoni", name: "Bodoni"),
        .init(id: "weekend", name: "Weekend"),
        .init(id: "literary", name: "Literary"),
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
    var theme = "milestone"
    var font = "inkwell"
    var isApplying = false
    /// What the Paper window is previewing; it equals theme and font until
    /// you pick something there, and goes back to them on Apply or Revert.
    var look = "table"
    var draftTheme = "milestone"
    var draftFont = "inkwell"
    var draftLook = "table"
    var desk = DeskSettings()
    var hosted = HostedDeskStatus(connected: false, status: "unknown")
    var isConnecting = false
    var hasDraft: Bool { draftTheme != theme || draftFont != font || draftLook != look }
    /// Mornings still to go, by theme id; a theme missing here is unlocked.
    var themeLocks: [String: Int] = [:]
    var launchAtLogin = false
    var headlines = Headlines()
    var headshotCount = InkwellPaths.headshotCount()
    var generatorTest: GeneratorTest = .idle
    var hasServiceKey = false
    var loginItemError: String?

    @ObservationIgnored private var cli: InkwellCLI?
    @ObservationIgnored private var refreshTask: Task<Void, Never>?
    @ObservationIgnored var onStatusChange: (() -> Void)?
    @ObservationIgnored var onDeskAction: ((DeskRequest?) -> Void)?
    @ObservationIgnored private var hasDraftInFlight = false
    @ObservationIgnored private lazy var paper: PaperWindow = {
        let window = PaperWindow(bar: PaperBar(model: self))
        window.onRate = { [weak self] rating in self?.ratePortrait(rating) }
        window.onClose = { [weak self] in self?.paperClosed() }
        window.onShare = { [weak self] request in self?.share(request) }
        window.onDesk = { [weak self] request in self?.onDeskAction?(request) }
        return window
    }()

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
        if let value = config["font"] as? String, !value.isEmpty {
            font = value
        }
        look = (config["style"] as? String).flatMap { PaperLook.all.map(\.id).contains($0) ? $0 : nil } ?? "table"
        if !hasDraftInFlight { draftTheme = theme; draftFont = font; draftLook = look }
        headlines = Headlines(config["headlines"] as? [String: Any] ?? [:])
        hasServiceKey = !headlines.service.isEmpty && Keychain.has(headlines.service)
        let sources = config["sources"] as? [String: Any] ?? [:]
        let gmail = sources["gmail"] as? [String: Any] ?? [:]
        desk = DeskSettings(
            data: (gmail["data"] as? String) ?? "composio",
            model: (gmail["model"] as? String) ?? "inkwell",
            proxyUrl: (gmail["proxyUrl"] as? String) ?? "http://127.0.0.1:8787",
            license: currentLicense(gmail: gmail)
        )
    }

    /// The license belongs in pro.json. Older builds kept it in config.json,
    /// which `inkwell-daily config` prints, so move it once and scrub it there.
    private func currentLicense(gmail: [String: Any]) -> String {
        let file = InkwellPaths.proFile()
        let saved = ProStore.license(file)
        if !saved.isEmpty { return saved }
        guard let old = gmail["license"] as? String, !old.isEmpty else { return "" }
        do {
            try ProStore.setLicense(old, at: file)
            scrubLicenseFromConfig()
        } catch {
            // Keep the old copy rather than lose the license to a failed write.
        }
        return old
    }

    private func scrubLicenseFromConfig() {
        var sources = ConfigStore.read(InkwellPaths.configFile())["sources"] as? [String: Any] ?? [:]
        guard var gmail = sources["gmail"] as? [String: Any], gmail["license"] != nil else { return }
        gmail.removeValue(forKey: "license")
        sources["gmail"] = gmail
        try? ConfigStore.set("sources", sources, at: InkwellPaths.configFile())
    }

    func setDesk(_ value: DeskSettings) {
        desk = value
        do {
            var sources = ConfigStore.read(InkwellPaths.configFile())["sources"] as? [String: Any] ?? [:]
            var gmail = sources["gmail"] as? [String: Any] ?? [:]
            gmail["data"] = value.data
            gmail["model"] = value.model
            gmail["proxyUrl"] = value.proxyUrl
            gmail.removeValue(forKey: "license")
            sources["gmail"] = gmail
            try ConfigStore.set("sources", sources, at: InkwellPaths.configFile())
            try ProStore.setLicense(value.license, at: InkwellPaths.proFile())
        } catch {
            lastError = error.localizedDescription
            refreshConfig()
        }
    }

    private func hostedClient() -> HostedDeskClient? {
        guard let base = URL(string: desk.proxyUrl), !desk.license.isEmpty,
              HostedDeskClient.isAllowed(base) else { return nil }
        return HostedDeskClient(base: base, license: desk.license)
    }

    func refreshHosted() {
        guard let client = hostedClient() else {
            let why = (desk.license.isEmpty || desk.proxyUrl.isEmpty)
                ? nil
                : "The proxy must use https, or http to this machine."
            hosted = HostedDeskStatus(connected: false, status: "missing", error: why)
            return
        }
        Task {
            let status = await client.status()
            self.hosted = status
        }
    }

    func connectHosted() {
        guard let client = hostedClient() else {
            hosted = HostedDeskStatus(connected: false, status: "error", error: "Set the hosted proxy and license first.")
            return
        }
        guard !isConnecting else { return }
        isConnecting = true
        Task {
            do {
                let url = try await client.connect()
                NSWorkspace.shared.open(url)
                for _ in 0..<60 {
                    try? await Task.sleep(for: .seconds(2))
                    let status = await client.status()
                    self.hosted = status
                    if status.connected { break }
                }
            } catch {
                self.hosted = HostedDeskStatus(connected: false, status: "error", error: error.localizedDescription)
            }
            self.isConnecting = false
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

    // The paper opens in its own window; the CLI marks the morning read and
    // says which file to show.
    func openPaper(_ date: String? = nil) {
        run(["open", "--no-browser"] + (date.map { [$0] } ?? [])) { result in
            self.refresh()
            if case .success(let output) = result, let file = Self.path(output) { self.paper.show(file) }
        }
    }

    func openInBrowser() {
        run(["open"]) { _ in self.refresh() }
    }

    private static func path(_ output: String) -> URL? {
        let line = output.trimmingCharacters(in: .whitespacesAndNewlines)
        return line.hasPrefix("/") && line.hasSuffix(".html") ? URL(fileURLWithPath: line) : nil
    }

    private var latestFile: URL? {
        status.latest.map { InkwellPaths.dataDirectory().appendingPathComponent("editions/\($0.date).html") }
    }

    func buildNow() {
        guard !isBuilding else { return }
        isBuilding = true
        lastError = nil
        run(["build"]) { result in
            self.isBuilding = false
            // On failure, lastError is already set by run.
            self.refresh()
            if case .success = result { self.paper.reload(self.latestFile) }
        }
    }

    func openIndex() {
        run(["index"])
    }

    // Which themes are earned yet, from `inkwell-daily theme --json`.
    func refreshThemeLocks() {
        run(["theme", "--json"]) { result in
            guard case .success(let output) = result, let data = output.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let themes = json["themes"] as? [[String: Any]] else { return }
            var locks: [String: Int] = [:]
            for t in themes where (t["unlocked"] as? Bool) == false {
                if let id = t["id"] as? String { locks[id] = (t["remaining"] as? NSNumber)?.intValue ?? 0 }
            }
            self.themeLocks = locks
        }
    }

    // Like the font: set it, then reset the newest edition in it and open it.
    func setTheme(_ id: String) {
        guard id != theme, !isBuilding, !isApplying, themeLocks[id] == nil else { return }
        theme = id
        run(["theme", id]) { result in
            self.refreshConfig()
            guard case .success = result else { return }
            self.restyleLatest()
        }
    }

    // A new pairing is set, then the newest edition is reset in it and opened,
    // so the change shows at once instead of tomorrow morning.
    func setFont(_ id: String) {
        guard id != font, !isBuilding, !isApplying else { return }
        font = id
        run(["font", id]) { result in
            self.refreshConfig()
            guard case .success = result else { return }
            self.restyleLatest()
        }
    }

    // MARK: Previewing in the Paper window

    func previewTheme(_ id: String) {
        guard themeLocks[id] == nil else { return }
        draftTheme = id
        hasDraftInFlight = hasDraft
        showDraft()
    }

    func previewFont(_ id: String) {
        draftFont = id
        hasDraftInFlight = hasDraft
        showDraft()
    }

    func previewLook(_ id: String) {
        draftLook = id
        hasDraftInFlight = hasDraft
        showDraft()
    }

    // Settings sets the look at once, like the theme and font.
    func setLook(_ id: String) {
        guard id != look, !isBuilding, !isApplying else { return }
        look = id
        draftLook = id
        run(["style", id]) { result in
            self.refreshConfig()
            guard case .success = result else { return }
            self.restyleLatest()
        }
    }

    func revertDraft() {
        draftTheme = theme
        draftFont = font
        draftLook = look
        hasDraftInFlight = false
        showDraft()
    }

    // Saves the previewed theme and font, then restyles the file to match.
    func applyDraft() {
        guard hasDraft, !isApplying else { return }
        var steps: [[String]] = []
        if draftTheme != theme { steps.append(["theme", draftTheme]) }
        if draftFont != font { steps.append(["font", draftFont]) }
        if draftLook != look { steps.append(["style", draftLook]) }
        isApplying = true
        save(steps)
    }

    private func save(_ steps: [[String]]) {
        guard let step = steps.first else {
            hasDraftInFlight = false
            refreshConfig()
            isApplying = false
            restyleLatest()
            return
        }
        run(step) { result in
            guard case .success = result else {
                // lastError says why; the preview stays so nothing is lost.
                self.isApplying = false
                return
            }
            self.save(Array(steps.dropFirst()))
        }
    }

    // A preview nobody applied doesn't outlive the window.
    func paperClosed() {
        draftTheme = theme
        draftFont = font
        draftLook = look
        hasDraftInFlight = false
    }

    private func showDraft() {
        run(["restyle", "--preview", "--theme", draftTheme, "--font", draftFont, "--look", draftLook]) { result in
            guard case .success(let output) = result, let style = Self.style(output) else { return }
            self.paper.apply(style: style)
        }
    }

    private static func style(_ output: String) -> [String: Any]? {
        guard let data = output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return json["style"] as? [String: Any]
    }

    // A theme or font only changes colours and type, so the newest edition is
    // restyled in place (a fraction of a second) rather than set again.
    func restyleLatest() {
        isApplying = true
        run(["restyle"]) { result in
            self.isApplying = false
            switch result {
            case .success(let output):
                // An open paper takes the new style without reloading.
                if self.paper.isVisible, Self.style(output) != nil {
                    // The file now carries today's whole stylesheet; a reload
                    // of a local page is instant and picks up any new look.
                    self.paper.reload(nil)
                } else {
                    self.openPaper(self.status.latest?.date)
                }
            case .failure: self.resetLatest() // an edition from before restyle: set it again
            }
        }
    }

    func resetLatest() {
        guard !isBuilding else { return }
        isBuilding = true
        var args = ["build"]
        if let date = status.latest?.date { args += ["--date", date] }
        run(args) { result in
            self.isBuilding = false
            self.refresh()
            guard case .success = result else { return }
            if self.paper.isVisible { self.paper.reload(self.latestFile) } else { self.openPaper(self.status.latest?.date) }
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

    // Make headlines: the headshots, and any image generator the reader picks.
    func setHeadlines(_ value: Headlines) {
        headlines = value
        do {
            try ConfigStore.set("headlines", value.json, at: InkwellPaths.configFile())
        } catch {
            lastError = error.localizedDescription
            refreshConfig()
        }
    }

    @ObservationIgnored private lazy var sharer = ShareWindow()

    // The card is written beside the edition when it's set; the PNG is kept
    // in share/ so it can be found again.
    func share(_ request: ShareRequest) {
        let data = InkwellPaths.dataDirectory()
        sharer.share(card: data.appendingPathComponent("editions/\(request.date)-share.html"),
                     png: data.appendingPathComponent("share/inkwell-\(request.date).png"))
    }

    func shareLatest() {
        guard let date = status.latest?.date, let url = URL(string: "inkwell-daily://share?date=\(date)"),
              let request = ShareRequest(url: url) else { return }
        share(request)
    }

    func ratePortrait(_ rating: PortraitRating) {
        run(rating.arguments)
    }

    // One run of the generator on a headshot, opened in Preview.
    func testGenerator() {
        generatorTest = .running
        run(["portrait", "test"]) { result in
            switch result {
            case .success(let output):
                guard let data = output.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let path = json["path"] as? String else {
                    self.generatorTest = .failed("This inkwell-daily is too old for Test Generator. Choose a newer one under Command.")
                    return
                }
                self.generatorTest = .passed(json["photo"] as? String ?? "")
                NSWorkspace.shared.open(URL(fileURLWithPath: path))
            case .failure:
                // The CLI says why on stderr, which the runner hands back.
                self.generatorTest = .failed(self.lastError ?? "The generator didn't make a picture.")
                self.lastError = nil
            }
        }
    }

    // A new service starts without consent: it's a new place for your photos.
    func setService(_ id: String) {
        guard id != headlines.service else { return }
        var next = headlines
        next.service = id
        next.model = ""
        next.consent = false
        generatorTest = .idle
        hasServiceKey = Keychain.has(id)
        setHeadlines(next)
    }

    func saveServiceKey(_ key: String) {
        do {
            try Keychain.set(headlines.service, key: key)
            hasServiceKey = Keychain.has(headlines.service)
            generatorTest = .idle
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    func removeServiceKey() {
        Keychain.remove(headlines.service)
        hasServiceKey = false
    }

    func chooseGenerator() {
        let panel = NSOpenPanel()
        panel.message = "Choose an image generator: any command that takes a photo and an output path"
        panel.prompt = "Choose"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false

        guard panel.runModal() == .OK, let url = panel.url else { return }
        guard FileManager.default.isExecutableFile(atPath: url.path) else {
            lastError = "\(url.lastPathComponent) isn't executable. Run chmod +x on it first."
            return
        }
        var next = headlines
        next.service = "command"
        next.generator = url.path
        next.consent = false
        generatorTest = .idle
        setHeadlines(next)
    }

    func addHeadshots() {
        let panel = NSOpenPanel()
        panel.message = "Add headshots. Start a file's name with triumphant, steady, quiet or rough to match a day's mood."
        panel.prompt = "Add"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = true
        panel.allowedContentTypes = [.jpeg, .png, .webP]

        guard panel.runModal() == .OK else { return }
        let folder = InkwellPaths.portraitsDirectory()
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            for url in panel.urls {
                let target = folder.appendingPathComponent(url.lastPathComponent)
                if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
                try FileManager.default.copyItem(at: url, to: target)
                try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
            }
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
        headshotCount = InkwellPaths.headshotCount()
    }

    func revealHeadshots() {
        let folder = InkwellPaths.portraitsDirectory()
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        NSWorkspace.shared.activateFileViewerSelecting([folder])
    }

    func openConfig() {
        NSWorkspace.shared.open(InkwellPaths.configFile())
    }

    func revealData() {
        NSWorkspace.shared.activateFileViewerSelecting([InkwellPaths.dataDirectory()])
    }
}

/// config.json's "headlines": whether the paper makes them, and which
/// generator draws the portrait. Consent resets whenever the generator changes.
struct Headlines: Equatable {
    var enabled = true
    var service = ""
    var model = ""
    var generator = ""
    var consent = false

    init() {}

    init(_ json: [String: Any]) {
        enabled = json["enabled"] as? Bool ?? true
        generator = json["generator"] as? String ?? ""
        service = json["service"] as? String ?? (generator.isEmpty ? "" : "command")
        model = json["model"] as? String ?? ""
        consent = json["consent"] as? Bool ?? false
    }

    var json: [String: Any] {
        var out: [String: Any] = ["enabled": enabled, "consent": consent]
        if !service.isEmpty { out["service"] = service }
        if !model.isEmpty { out["model"] = model }
        if !generator.isEmpty { out["generator"] = generator }
        return out
    }
}

/// The image services Make headlines can draw with; lib/imagegen.js has the calls.
struct ImageService: Identifiable, Hashable {
    let id: String
    let name: String
    let modelHint: String
    let keyHint: String

    static let all: [ImageService] = [
        .init(id: "", name: "None · plain halftone", modelHint: "", keyHint: ""),
        .init(id: "openai", name: "OpenAI (GPT Image)", modelHint: "gpt-image-2", keyHint: "sk-…"),
        .init(id: "recraft", name: "Recraft", modelHint: "Recraft's default", keyHint: "Recraft API token"),
        .init(id: "higgsfield", name: "Higgsfield", modelHint: "higgsfield/ads-studio/v1.0", keyHint: "KEY_ID:KEY_SECRET"),
        .init(id: "command", name: "Your own command", modelHint: "", keyHint: ""),
    ]

    static func find(_ id: String) -> ImageService { all.first { $0.id == id } ?? all[0] }
}

enum GeneratorTest: Equatable {
    case idle, running
    case passed(String)
    case failed(String)
}
