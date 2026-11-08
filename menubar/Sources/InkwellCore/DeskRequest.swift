import Foundation

/// A desk action from the paper: `inkwell-daily://desk?desk=gmail&action=reconnect`.
/// Only the five known desks and four known actions get through, so a link in
/// a published page cannot open anything else.
public struct DeskRequest: Equatable, Sendable {
    public let desk: String
    public let action: String

    public init?(url: URL) {
        guard url.scheme == "inkwell-daily", url.host == "desk",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let items = components.queryItems ?? []
        guard let raw = items.first(where: { $0.name == "desk" })?.value?.lowercased(),
              let desk = Self.desks[raw] else { return nil }
        let action = (items.first(where: { $0.name == "action" })?.value ?? "manage").lowercased()
        guard Self.actions.contains(action) else { return nil }
        self.desk = desk
        self.action = action
    }

    private static let desks: [String: String] = [
        "gmail": "gmail", "mail": "gmail",
        "slack": "slack", "city": "slack",
        "notion": "notion", "notebook": "notion",
        "calendar": "calendar", "daybook": "calendar",
        "basecamp": "basecamp", "project": "basecamp"
    ]
    private static let actions = ["manage", "reconnect", "retry", "connect"]

    public var name: String {
        switch desk {
        case "gmail": return "Gmail · The Mail Bag"
        case "slack": return "Slack · The City Desk"
        case "notion": return "Notion · The Notebook"
        case "calendar": return "Google Calendar · The Day Book"
        default: return "Basecamp · The Project Desk"
        }
    }

    public var product: String {
        switch desk {
        case "gmail": return "Gmail"
        case "slack": return "Slack"
        case "notion": return "Notion"
        case "calendar": return "Google Calendar"
        default: return "Basecamp"
        }
    }

    public var actionLabel: String {
        switch action {
        case "reconnect": return "Reconnect"
        case "retry": return "Retry"
        case "connect": return "Connect"
        default: return "Manage"
        }
    }

    public var instruction: String {
        switch action {
        case "reconnect": return "Reconnect \(product) in the Pro sheet."
        case "connect": return "Connect \(product) in the Pro sheet."
        case "retry": return "Set a new edition to try the desk again."
        default: return "Open the Pro sheet to reconnect or change this desk."
        }
    }
}
