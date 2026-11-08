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

@Test("A portrait link carries only an exact verdict and date")
func portraitRatingLinks() {
    let good = PortraitRating(url: URL(string: "inkwell-daily://portrait?verdict=good&date=2026-11-06")!)
    #expect(good?.arguments == ["portrait", "good", "2026-11-06"])
    #expect(PortraitRating(url: URL(string: "inkwell-daily://portrait?verdict=bad&date=2026-11-06")!)?.verdict == "bad")
    #expect(PortraitRating(url: URL(string: "inkwell-daily://portrait?verdict=test&date=2026-11-06")!) == nil)
    #expect(PortraitRating(url: URL(string: "inkwell-daily://portrait?verdict=good&date=--help")!) == nil)
    #expect(PortraitRating(url: URL(string: "inkwell-daily://other?verdict=good&date=2026-11-06")!) == nil)
    #expect(PortraitRating(url: URL(string: "https://portrait?verdict=good&date=2026-11-06")!) == nil)
}

@Test("A share link carries only a real date")
func shareLinks() {
    #expect(ShareRequest(url: URL(string: "inkwell-daily://share?date=2026-11-06")!)?.date == "2026-11-06")
    #expect(ShareRequest(url: URL(string: "inkwell-daily://share?date=../../etc")!) == nil)
    #expect(ShareRequest(url: URL(string: "inkwell-daily://portrait?date=2026-11-06")!) == nil)
    #expect(PortraitRating(url: URL(string: "inkwell-daily://share?date=2026-11-06")!) == nil)
}

@Test("A desk link carries only a known desk and action")
func deskLinks() {
    let manage = DeskRequest(url: URL(string: "inkwell-daily://desk?desk=gmail")!)
    #expect(manage?.desk == "gmail")
    #expect(manage?.action == "manage")
    #expect(manage?.name == "Gmail · The Mail Bag")
    #expect(manage?.instruction.contains("Pro sheet") == true)

    let reconnect = DeskRequest(url: URL(string: "inkwell-daily://desk?desk=slack&action=reconnect")!)
    #expect(reconnect?.desk == "slack")
    #expect(reconnect?.action == "reconnect")
    #expect(reconnect?.name == "Slack · The City Desk")

    #expect(DeskRequest(url: URL(string: "inkwell-daily://desk?desk=mail&action=manage")!)?.desk == "gmail", "the slot id maps to the product")
    #expect(DeskRequest(url: URL(string: "inkwell-daily://desk?desk=../../etc")!) == nil)
    #expect(DeskRequest(url: URL(string: "inkwell-daily://desk?desk=gmail&action=drop")!) == nil)
    #expect(DeskRequest(url: URL(string: "https://desk?desk=gmail")!) == nil)
}

private final class RequestBox: @unchecked Sendable {
    var request: URLRequest?
}

@Test("The hosted desk reads its status and returns a Connect Link")
func hostedDeskClient() async throws {
    let base = URL(string: "http://127.0.0.1:8787")!
    let box = RequestBox()
    let client = HostedDeskClient(base: base, license: "dev") { request in
        box.request = request
        if request.url?.path == "/status" {
            return (Data(#"{"ok":true,"connected":true,"status":"ACTIVE"}"#.utf8), 200)
        }
        return (Data(#"{"ok":true,"url":"https://connect.composio.dev/link/ln_1"}"#.utf8), 200)
    }

    let status = await client.status()
    #expect(status.connected)
    #expect(status.label == "Connected")

    let url = try await client.connect()
    #expect(url.absoluteString == "https://connect.composio.dev/link/ln_1")
    #expect(box.request?.value(forHTTPHeaderField: "authorization") == "Bearer dev")
    #expect(box.request?.httpMethod == "POST")
    #expect(box.request?.url?.path == "/connect")
}

@Test("The hosted desk reports a missing connection and a failed proxy")
func hostedDeskMissing() async {
    let base = URL(string: "http://127.0.0.1:8787")!
    let missing = HostedDeskClient(base: base, license: "dev") { _ in
        (Data(#"{"ok":true,"connected":false,"status":"missing"}"#.utf8), 200)
    }
    #expect(await missing.status().label == "Not connected")

    let failed = HostedDeskClient(base: base, license: "dev") { _ in (Data(), 500) }
    let result = await failed.status()
    #expect(result.label == "Proxy unreachable")
    #expect(result.connected == false)
}
