import Foundation

/// What the proxy says about the reader's hosted connection.
public struct HostedDeskStatus: Equatable, Sendable {
    public let connected: Bool
    public let status: String
    public let error: String?

    public init(connected: Bool, status: String, error: String? = nil) {
        self.connected = connected
        self.status = status
        self.error = error
    }

    public var label: String {
        if connected { return "Connected" }
        switch status {
        case "missing": return "Not connected"
        case "INITIATED", "PENDING", "pending": return "Waiting for Gmail…"
        case "error": return "Proxy unreachable"
        default: return status.isEmpty ? "Not connected" : status
        }
    }
}

public enum HostedDeskError: Error, LocalizedError, Equatable {
    case message(String)

    public var errorDescription: String? {
        switch self {
        case .message(let text): return text
        }
    }
}

/// The app's side of the hosted desk proxy. The license is the Pro account;
/// the Composio key never leaves the proxy.
public struct HostedDeskClient: Sendable {
    public let base: URL
    public let license: String
    private let transport: @Sendable (URLRequest) async throws -> (Data, Int)

    public init(
        base: URL,
        license: String,
        transport: @escaping @Sendable (URLRequest) async throws -> (Data, Int) = { request in
            let (data, response) = try await URLSession.shared.data(for: request)
            return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    ) {
        self.base = base
        self.license = license
        self.transport = transport
    }

    /// The license travels in a header and the answer carries mail, so plain
    /// http is allowed only to the machine itself.
    public static func isAllowed(_ url: URL) -> Bool {
        switch (url.scheme ?? "").lowercased() {
        case "https":
            return true
        case "http":
            let host = (url.host ?? "").lowercased()
            return host == "127.0.0.1" || host == "localhost" || host == "::1"
        default:
            return false
        }
    }

    public func status() async -> HostedDeskStatus {
        do {
            let (data, code) = try await transport(request("/status", method: "GET"))
            guard code == 200 else {
                return HostedDeskStatus(connected: false, status: "error", error: "The hosted desk answered with an error.")
            }
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            let connected = json["connected"] as? Bool ?? false
            let status = json["status"] as? String ?? (connected ? "ACTIVE" : "unknown")
            return HostedDeskStatus(connected: connected, status: status, error: json["error"] as? String)
        } catch {
            return HostedDeskStatus(connected: false, status: "error", error: error.localizedDescription)
        }
    }

    public func connect(toolkit: String = "gmail") async throws -> URL {
        let body = try JSONSerialization.data(withJSONObject: ["toolkit": toolkit])
        let (data, code) = try await transport(request("/connect", method: "POST", body: body))
        guard code == 200 else { throw HostedDeskError.message("The hosted desk couldn't start the connection.") }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard let text = json["url"] as? String,
              let url = URL(string: text),
              HostedDeskClient.isAllowed(url) else {
            throw HostedDeskError.message("The hosted desk didn't return a usable Connect Link.")
        }
        return url
    }

    private func request(_ path: String, method: String, body: Data? = nil) -> URLRequest {
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("Bearer " + license, forHTTPHeaderField: "authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = body
        }
        return request
    }
}
