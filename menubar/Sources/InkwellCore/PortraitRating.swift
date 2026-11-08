import Foundation

/// A verdict from the paper's portrait buttons, which open
/// inkwell-daily://portrait?verdict=good&date=2026-11-06. Any web page can
/// open that link, so only an exact verdict and date get through.
public struct PortraitRating: Equatable, Sendable {
    public let verdict: String
    public let date: String

    public init?(url: URL) {
        guard url.scheme == "inkwell-daily", url.host == "portrait",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let verdict = items.first(where: { $0.name == "verdict" })?.value,
              let date = items.first(where: { $0.name == "date" })?.value,
              ["good", "bad"].contains(verdict),
              date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return nil }
        self.verdict = verdict
        self.date = date
    }

    public var arguments: [String] { ["portrait", verdict, date] }
}
