import Foundation
import Testing

@testable import InkwellCore

private func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}

@Test("An edition index decodes the fields the menu needs")
func editionIndexDecodes() throws {
    let json = """
    {
      "version": 1,
      "editions": [
        {"date":"2026-11-07","title":"Randy's Inkwell Sunday","headline":"1 commit landed in mussel",
         "deck":"A long session.","kicker":"Agent desk","minutes":3,"weekend":true,"late":true,
         "builtAt":1794080250306,"path":"/tmp/2026-11-07.html"},
        {"date":"2026-11-06","title":"Randy's Inkwell Daily","headline":"A quiet Friday","minutes":2,
         "weekend":false,"late":false,"builtAt":1794080509911,"path":"/tmp/2026-11-06.html"}
      ]
    }
    """
    let index = try JSONDecoder().decode(EditionIndex.self, from: Data(json.utf8))
    #expect(index.version == 1)
    #expect(index.editions.count == 2)
    #expect(index.editions[0].date == "2026-11-07")
    #expect(index.editions[0].headline == "1 commit landed in mussel")
    #expect(index.editions[1].deck == nil)
}

@Test("The newest edition wins and the read file decides unread")
func statusLoadsLatestAndUnread() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let json = """
    {"version":1,"editions":[
      {"date":"2026-11-05","title":"Old","headline":"Old news"},
      {"date":"2026-11-07","title":"New","headline":"New news"}
    ]}
    """
    try Data(json.utf8).write(to: directory.appendingPathComponent("editions.json"))

    try "2026-11-06".write(to: directory.appendingPathComponent("read"), atomically: true, encoding: .utf8)
    let unread = InkwellStatus.load(dataDirectory: directory)
    #expect(unread.latest?.date == "2026-11-07")
    #expect(unread.unread)
    #expect(unread.editionCount == 2)

    try "2026-11-07".write(to: directory.appendingPathComponent("read"), atomically: true, encoding: .utf8)
    let read = InkwellStatus.load(dataDirectory: directory)
    #expect(!read.unread)
}

@Test("An empty data folder has no edition and is not unread")
func statusEmpty() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let status = InkwellStatus.load(dataDirectory: directory)
    #expect(status.latest == nil)
    #expect(!status.unread)
    #expect(status.editionCount == 0)
}

@Test("Edition dates read like a newspaper dateline")
func editionDateDisplay() {
    #expect(EditionDate.display("2026-11-07") == "Saturday, 7 November")
    #expect(EditionDate.display("not-a-date") == "not-a-date")
}

@Test("The command is found without a login shell PATH")
func locatesCLI() throws {
    let home = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: home) }

    let bin = home.appendingPathComponent(".local/bin", isDirectory: true)
    try FileManager.default.createDirectory(at: bin, withIntermediateDirectories: true)
    let command = bin.appendingPathComponent("inkwell-daily")
    try "#!/bin/sh\n".write(to: command, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: command.path)

    let found = InkwellPaths.locateCLI(home: home, environment: [:], fixedPaths: [])
    #expect(found?.resolvingSymlinksInPath().path == command.resolvingSymlinksInPath().path)
}

@Test("An explicit INKWELL_CLI wins")
func explicitCommandWins() throws {
    let home = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: home) }

    let command = home.appendingPathComponent("custom-inkwell")
    try "#!/bin/sh\n".write(to: command, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: command.path)

    let found = InkwellPaths.locateCLI(home: home, environment: ["INKWELL_CLI": command.path])
    #expect(found?.resolvingSymlinksInPath().path == command.resolvingSymlinksInPath().path)
}
