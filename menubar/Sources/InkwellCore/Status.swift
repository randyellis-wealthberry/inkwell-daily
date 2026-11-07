import Foundation

/// The few facts the menu needs: the newest edition and whether it was read.
public struct InkwellStatus: Sendable, Equatable {
    public let latest: Edition?
    public let unread: Bool
    public let editionCount: Int

    public init(latest: Edition?, unread: Bool, editionCount: Int) {
        self.latest = latest
        self.unread = unread
        self.editionCount = editionCount
    }

    public static let empty = InkwellStatus(latest: nil, unread: false, editionCount: 0)

    public static func load(
        dataDirectory: URL = InkwellPaths.dataDirectory(),
        fileManager: FileManager = .default
    ) -> InkwellStatus {
        let indexURL = dataDirectory.appendingPathComponent("editions.json")
        let readURL = dataDirectory.appendingPathComponent("read")

        var editions: [Edition] = []
        if let data = try? Data(contentsOf: indexURL),
           let index = try? JSONDecoder().decode(EditionIndex.self, from: data) {
            editions = index.editions
        }

        // Newest first even if a hand-edited file is out of order.
        let sorted = editions.sorted { $0.date > $1.date }
        let latest = sorted.first

        let read = (try? String(contentsOf: readURL, encoding: .utf8))?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        return InkwellStatus(
            latest: latest,
            unread: latest.map { $0.date > read } ?? false,
            editionCount: editions.count
        )
    }
}
