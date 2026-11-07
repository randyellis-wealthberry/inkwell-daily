import Foundation

struct InkwellCLIError: LocalizedError, Sendable {
    let message: String
    var errorDescription: String? { message }
}

/// Runs the installed `inkwell-daily` command. A menu bar app gets a minimal
/// PATH, so the child gets the usual brew and local bin folders added.
@MainActor
final class InkwellCLI {
    let url: URL

    init(url: URL) {
        self.url = url
    }

    func run(_ arguments: [String], completion: @escaping @MainActor (Result<String, Error>) -> Void) {
        let process = Process()
        process.executableURL = url
        process.arguments = arguments
        process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser

        var environment = ProcessInfo.processInfo.environment
        let binPaths = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
        environment["PATH"] = (binPaths + [environment["PATH"] ?? ""]).joined(separator: ":")
        process.environment = environment

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr

        process.terminationHandler = { finished in
            let outData = stdout.fileHandleForReading.readDataToEndOfFile()
            let errData = stderr.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: outData, encoding: .utf8) ?? ""
            let errorOutput = String(data: errData, encoding: .utf8) ?? ""
            let status = finished.terminationStatus

            Task { @MainActor in
                if status == 0 {
                    completion(.success(output))
                } else {
                    let message = errorOutput.trimmingCharacters(in: .whitespacesAndNewlines)
                    completion(.failure(InkwellCLIError(
                        message: message.isEmpty ? "inkwell-daily exited with status \(status)" : message
                    )))
                }
            }
        }

        do {
            try process.run()
        } catch {
            completion(.failure(error))
        }
    }
}
