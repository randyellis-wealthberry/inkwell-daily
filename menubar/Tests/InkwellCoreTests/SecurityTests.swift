import Foundation
import Testing

@testable import InkwellCore

@Test("The proxy must be https, or http to this machine")
func hostedDeskAllowsOnlySecureBase() {
    #expect(HostedDeskClient.isAllowed(URL(string: "https://desks.example.com")!))
    #expect(HostedDeskClient.isAllowed(URL(string: "https://desks.example.com:8443")!))
    #expect(HostedDeskClient.isAllowed(URL(string: "http://127.0.0.1:8787")!))
    #expect(HostedDeskClient.isAllowed(URL(string: "http://localhost:8787")!))
    #expect(!HostedDeskClient.isAllowed(URL(string: "http://desks.example.com")!))
    #expect(!HostedDeskClient.isAllowed(URL(string: "ftp://desks.example.com")!))
}

@Test("A Connect Link that is not https is refused")
func hostedDeskRejectsNonHTTPSConnectLink() async {
    let client = HostedDeskClient(base: URL(string: "http://127.0.0.1:8787")!, license: "dev") { _ in
        (Data(#"{"ok":true,"url":"file:///Applications/Calculator.app"}"#.utf8), 200)
    }
    await #expect(throws: HostedDeskError.self) {
        _ = try await client.connect()
    }
}

@Test("The license is written to pro.json, readable only by its owner")
func proStoreKeepsLicensePrivate() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    let file = dir.appendingPathComponent("pro.json")

    try ProStore.setLicense("key-1234", at: file)
    #expect(ProStore.license(file) == "key-1234")

    let mode = (try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as? NSNumber)?.intValue
    #expect(mode == 0o600)

    // Merging, not replacing: the CLI's `url` must survive.
    try ProStore.setLicense("key-5678", at: file)
    #expect(ProStore.license(file) == "key-5678")

    try? FileManager.default.removeItem(at: dir)
}
