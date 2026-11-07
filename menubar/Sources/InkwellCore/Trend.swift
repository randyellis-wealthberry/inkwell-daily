import Foundation

public struct TrendDay: Codable, Identifiable, Sendable, Equatable {
    public var id: String { date }

    public let date: String
    public let label: String
    public let prompts: Int
    public let tokens: Int

    public init(date: String, label: String, prompts: Int, tokens: Int) {
        self.date = date
        self.label = label
        self.prompts = prompts
        self.tokens = tokens
    }

    public func value(for metric: String) -> Int {
        metric == "tokens" ? tokens : prompts
    }

    public var dateValue: Date {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        return parser.date(from: date) ?? Date(timeIntervalSince1970: 0)
    }
}

public struct TrendForecast: Codable, Sendable, Equatable {
    public let day: String
    public let prompts: Int
    public let tokens: Int
    public let direction: String
    public let deltaPercent: Int?

    public init(day: String, prompts: Int, tokens: Int, direction: String, deltaPercent: Int?) {
        self.day = day
        self.prompts = prompts
        self.tokens = tokens
        self.direction = direction
        self.deltaPercent = deltaPercent
    }

    public func value(for metric: String) -> Int {
        metric == "tokens" ? tokens : prompts
    }
}

public struct InkwellTrend: Codable, Sendable, Equatable {
    public let end: String
    public let days: [TrendDay]
    public let totalPrompts: Int
    public let totalTokens: Int
    public let activeDays: Int
    public let metric: String
    public let averagePrompts: Double
    public let averageTokens: Double
    public let forecast: TrendForecast
    public let headline: String
    public let teaser: String
    public let blurb: String
    public let busiest: String?

    public init(
        end: String,
        days: [TrendDay],
        totalPrompts: Int,
        totalTokens: Int,
        activeDays: Int,
        metric: String,
        averagePrompts: Double,
        averageTokens: Double,
        forecast: TrendForecast,
        headline: String,
        teaser: String,
        blurb: String,
        busiest: String?
    ) {
        self.end = end
        self.days = days
        self.totalPrompts = totalPrompts
        self.totalTokens = totalTokens
        self.activeDays = activeDays
        self.metric = metric
        self.averagePrompts = averagePrompts
        self.averageTokens = averageTokens
        self.forecast = forecast
        self.headline = headline
        self.teaser = teaser
        self.blurb = blurb
        self.busiest = busiest
    }
}

public enum TrendFormat {
    public static func tokens(_ n: Int) -> String {
        let value = Double(n)
        if n >= 10_000_000 { return String(format: "%.0fM", value / 1_000_000) }
        if n >= 1_000_000 { return String(format: "%.1fM", value / 1_000_000) }
        if n >= 1_000 { return String(format: "%.0fk", value / 1_000) }
        return "\(n)"
    }
}
