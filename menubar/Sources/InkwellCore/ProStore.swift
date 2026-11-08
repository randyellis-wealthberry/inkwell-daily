import Foundation

/// The Pro license, in `pro.json` beside the editions, mode 0600.
///
/// It lives here rather than in `config.json` for one reason: `inkwell-daily
/// config` prints config.json, and that output ends up in bug reports and CI
/// logs. A license is a working credential for someone's mail.
///
/// `inkwell-pro activate` writes the same file, so this merges rather than
/// replacing: the CLI owns `url`, the app owns `license`.
public enum ProStore {
    public static func read(_ url: URL) -> [String: Any] {
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return object
    }

    public static func license(_ url: URL) -> String {
        (read(url)["license"] as? String) ?? ""
    }

    public static func setLicense(_ license: String, at url: URL) throws {
        var values = read(url)
        values["license"] = license

        let data = try JSONSerialization.data(withJSONObject: values, options: [.prettyPrinted, .sortedKeys])
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        try (String(data: data, encoding: .utf8) ?? "{}").appending("\n").write(to: url, atomically: true, encoding: .utf8)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}
