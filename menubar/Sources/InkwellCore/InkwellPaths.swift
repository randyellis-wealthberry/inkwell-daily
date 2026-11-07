import Foundation

/// Where Inkwell Daily puts its editions, and where its command may live.
public enum InkwellPaths {
    public static func dataDirectory(
        home: URL = FileManager.default.homeDirectoryForCurrentUser
    ) -> URL {
        home.appendingPathComponent("Library/Application Support/InkwellDaily", isDirectory: true)
    }

    public static func indexFile(home: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        dataDirectory(home: home).appendingPathComponent("editions.json")
    }

    public static func readFile(home: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        dataDirectory(home: home).appendingPathComponent("read")
    }

    public static func configFile(home: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        dataDirectory(home: home).appendingPathComponent("config.json")
    }

    /// Absolute paths a GUI app can use without a login shell's PATH.
    public static let standardCLIPaths = [
        "/opt/homebrew/bin/inkwell-daily",
        "/usr/local/bin/inkwell-daily",
    ]

    public static func cliCandidates(
        home: URL = FileManager.default.homeDirectoryForCurrentUser,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        fixedPaths: [String] = standardCLIPaths
    ) -> [URL] {
        var paths: [String] = []

        if let override = environment["INKWELL_CLI"], !override.isEmpty {
            paths.append(override)
        }

        paths.append(contentsOf: fixedPaths)
        paths.append(contentsOf: [
            home.appendingPathComponent(".local/bin/inkwell-daily").path,
            home.appendingPathComponent("Developer/inkwell-daily/bin/inkwell-daily").path,
        ])

        // A brew shell may have another prefix on PATH.
        for directory in (environment["PATH"] ?? "").split(separator: ":") {
            paths.append(URL(fileURLWithPath: String(directory)).appendingPathComponent("inkwell-daily").path)
        }

        var seen = Set<String>()
        return paths.compactMap { path in
            guard seen.insert(path).inserted else { return nil }
            return URL(fileURLWithPath: path)
        }
    }

    public static func locateCLI(
        home: URL = FileManager.default.homeDirectoryForCurrentUser,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        fileManager: FileManager = .default,
        fixedPaths: [String] = standardCLIPaths
    ) -> URL? {
        cliCandidates(home: home, environment: environment, fixedPaths: fixedPaths)
            .first { fileManager.isExecutableFile(atPath: $0.path) }
    }
}
