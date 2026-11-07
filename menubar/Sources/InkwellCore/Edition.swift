import Foundation

/// One edition, as `inkwell-daily` writes it to editions.json.
public struct Edition: Codable, Identifiable, Sendable, Equatable {
    public var id: String { date }

    public let date: String
    public let title: String
    public let headline: String
    public let deck: String?
    public let kicker: String?
    public let minutes: Int?
    public let weekend: Bool?
    public let late: Bool?
    public let builtAt: Double?
    public let path: String?

    public init(
        date: String,
        title: String,
        headline: String,
        deck: String? = nil,
        kicker: String? = nil,
        minutes: Int? = nil,
        weekend: Bool? = nil,
        late: Bool? = nil,
        builtAt: Double? = nil,
        path: String? = nil
    ) {
        self.date = date
        self.title = title
        self.headline = headline
        self.deck = deck
        self.kicker = kicker
        self.minutes = minutes
        self.weekend = weekend
        self.late = late
        self.builtAt = builtAt
        self.path = path
    }
}

public struct EditionIndex: Codable, Sendable {
    public let version: Int?
    public let editions: [Edition]

    public init(version: Int? = nil, editions: [Edition]) {
        self.version = version
        self.editions = editions
    }
}

public enum EditionDate {
    /// "2026-11-07" as "Saturday, 7 November". Unknown keys pass through.
    public static func display(_ key: String, locale: Locale = Locale(identifier: "en_US_POSIX")) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: key) else { return key }

        let output = DateFormatter()
        output.locale = locale
        output.dateFormat = "EEEE, d MMMM"
        return output.string(from: date)
    }
}
