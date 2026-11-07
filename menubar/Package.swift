// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "InkwellDailyMenubar",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "InkwellDaily", targets: ["InkwellDaily"]),
    ],
    targets: [
        // Pure model and file parsing, so tests run without a host app.
        .target(name: "InkwellCore"),
        .executableTarget(name: "InkwellDaily", dependencies: ["InkwellCore"]),
        .testTarget(name: "InkwellCoreTests", dependencies: ["InkwellCore"]),
    ]
)
