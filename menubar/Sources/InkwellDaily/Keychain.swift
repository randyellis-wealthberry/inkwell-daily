import Foundation
import Security

/// Image service API keys live in the login Keychain, where the CLI reads
/// them with `security find-generic-password`; never in config.json.
enum Keychain {
    private static let account = "api-key"

    static func service(_ id: String) -> String { "com.wealthberrylabs.inkwell-daily.\(id)" }

    static func has(_ id: String) -> Bool {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service(id), kSecAttrAccount as String: account]
        return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
    }

    static func set(_ id: String, key: String) throws {
        remove(id)
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service(id),
            kSecAttrAccount as String: account,
            kSecAttrLabel as String: "Inkwell · \(id) API key",
            kSecValueData as String: Data(trimmed.utf8),
        ]
        if let access = access(id) { item[kSecAttrAccess as String] = access }
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw InkwellCLIError(message: SecCopyErrorMessageString(status, nil) as String? ?? "The Keychain said no (\(status)).")
        }
    }

    // The morning run reads the key unattended through /usr/bin/security, so
    // that tool and this app are trusted up front; nothing prompts at 5am.
    private static func access(_ id: String) -> SecAccess? {
        var apps: [SecTrustedApplication] = []
        for path in [nil, "/usr/bin/security"] as [String?] {
            var app: SecTrustedApplication?
            if SecTrustedApplicationCreateFromPath(path, &app) == errSecSuccess, let app { apps.append(app) }
        }
        var access: SecAccess?
        guard SecAccessCreate("Inkwell · \(id) API key" as CFString, apps as CFArray, &access) == errSecSuccess else { return nil }
        return access
    }

    static func remove(_ id: String) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service(id), kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
    }
}
