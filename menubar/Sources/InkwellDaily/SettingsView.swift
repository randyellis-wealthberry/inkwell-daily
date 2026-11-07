import AppKit
import Foundation
import InkwellCore
import SwiftUI

struct SettingsView: View {
    let model: InkwellModel

    var body: some View {
        Form {
            Section("Morning") {
                Picker("Set the paper at", selection: Binding(get: { model.hour }, set: { model.setHour($0) })) {
                    ForEach(0..<24, id: \.self) { hour in
                        Text(String(format: "%d:00", hour)).tag(hour)
                    }
                }
            }

            Section("Paper") {
                Toggle("Notify when the paper arrives", isOn: Binding(get: { model.notify }, set: { model.setNotify($0) }))
                Picker("Theme", selection: Binding(get: { model.theme }, set: { model.setTheme($0) })) {
                    ForEach(InkwellTheme.all) { theme in
                        Text(theme.name).tag(theme.id)
                    }
                }
            }

            Section("General") {
                Toggle("Launch at Login", isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) }))
                if let error = model.loginItemError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            Section("Command") {
                if let url = model.cliURL {
                    Text(url.path)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                } else {
                    Text("inkwell-daily was not found.")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                Button("Choose inkwell-daily Command…") { model.chooseCLI() }
            }

            Section {
                Button("Open Settings File") { model.openConfig() }
                Button("Reveal Editions Folder") { model.revealData() }
            }

            if let error = model.lastError {
                Section {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .padding(20)
    }
}
