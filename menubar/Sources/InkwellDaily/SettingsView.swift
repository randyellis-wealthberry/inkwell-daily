import AppKit
import Foundation
import InkwellCore
import SwiftUI

struct SettingsView: View {
    let model: InkwellModel
    @State private var apiKey = ""
    @State private var modelName = ""
    @FocusState private var modelFocused: Bool
    private let fieldWidth: CGFloat = 220
    private let buttonWidth: CGFloat = 72
    private let showHeadshots = false

    // The model is saved when you're done typing, not on every key.
    private func saveModel() {
        let value = modelName.trimmingCharacters(in: .whitespaces)
        guard value != model.headlines.model else { return }
        var next = model.headlines
        next.model = value
        model.setHeadlines(next)
    }

    private func saveKey() {
        guard !apiKey.isEmpty else { return }
        model.saveServiceKey(apiKey)
        apiKey = ""
    }

    private func headline(_ key: WritableKeyPath<Headlines, Bool>) -> Binding<Bool> {
        Binding(get: { model.headlines[keyPath: key] }, set: { value in
            var next = model.headlines
            next[keyPath: key] = value
            model.setHeadlines(next)
        })
    }

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
                        if let left = model.themeLocks[theme.id] {
                            Text("\(theme.name) · \(left) more \(left == 1 ? "morning" : "mornings")").tag(theme.id).selectionDisabled()
                        } else {
                            Text(theme.name).tag(theme.id)
                        }
                    }
                }
                .disabled(model.isBuilding)
                Picker("Style", selection: Binding(get: { model.look }, set: { model.setLook($0) })) {
                    ForEach(PaperLook.all) { look in
                        Text(look.name).tag(look.id)
                    }
                }
                .disabled(model.isBuilding)
                Picker("Font", selection: Binding(get: { model.font }, set: { model.setFont($0) })) {
                    ForEach(InkwellFont.all) { font in
                        Text(font.name).tag(font.id)
                    }
                }
                .disabled(model.isBuilding)
                LabeledContent {
                    Button("Reset Paper") { model.resetLatest() }
                        .disabled(model.isBuilding)
                } label: {
                    if model.isApplying {
                        HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Applying…") }
                    } else if model.isBuilding {
                        HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Resetting the paper…") }
                    } else {
                        Text("Set the newest edition again with these settings")
                    }
                }
            }

            Section {
                Toggle("Make headlines", isOn: headline(\.enabled))
                // Headshots are parked for now; the front page gets a made
                // photograph and a quote instead.
                if model.headlines.enabled && showHeadshots {
                    LabeledContent("Headshots") {
                        HStack(spacing: 8) {
                            Text(model.headshotCount == 0 ? "None yet" : "\(model.headshotCount)")
                                .foregroundStyle(model.headshotCount == 0 ? .red : .secondary)
                            Button("Show Folder") { model.revealHeadshots() }
                            Button("Add…") { model.addHeadshots() }
                        }
                    }
                }
            } header: {
                Text("Make headlines")
            } footer: {
                Text("Inkwell Pro puts a photograph and an inspirational quote under the day's headline.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if model.headlines.enabled {
                let service = ImageService.find(model.headlines.service)
                Section {
                    Picker("Image service", selection: Binding(get: { model.headlines.service }, set: { model.setService($0) })) {
                        ForEach(ImageService.all.filter { ["", "recraft"].contains($0.id) }) { service in
                            Text(service.name).tag(service.id)
                        }
                    }

                    if service.id == "command" {
                        LabeledContent("Command") {
                            HStack(spacing: 8) {
                                Text(model.headlines.generator.isEmpty ? "None chosen" : (model.headlines.generator as NSString).lastPathComponent)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                    .help(model.headlines.generator)
                                Button("Choose…") { model.chooseGenerator() }
                            }
                        }
                    } else if !service.id.isEmpty {
                        LabeledContent("API key") {
                            HStack(spacing: 8) {
                                SecureField("API key", text: $apiKey, prompt: Text(model.hasServiceKey ? "Saved in Keychain" : service.keyHint))
                                    .labelsHidden()
                                    .textFieldStyle(.roundedBorder)
                                    .multilineTextAlignment(.leading)
                                    .frame(width: fieldWidth)
                                    .onSubmit { saveKey() }
                                Group {
                                    if model.hasServiceKey && apiKey.isEmpty {
                                        Button("Remove") { model.removeServiceKey() }
                                    } else {
                                        Button("Save") { saveKey() }
                                            .disabled(apiKey.isEmpty)
                                    }
                                }
                                .frame(width: buttonWidth)
                            }
                        }
                        LabeledContent("Model") {
                            HStack(spacing: 8) {
                                TextField("Model", text: $modelName, prompt: Text(service.modelHint))
                                    .labelsHidden()
                                    .textFieldStyle(.roundedBorder)
                                    .multilineTextAlignment(.leading)
                                    .frame(width: fieldWidth)
                                // Keeps the field lined up with the key field's.
                                Color.clear.frame(width: buttonWidth, height: 1)
                            }
                                    .focused($modelFocused)
                                    .onSubmit { saveModel() }
                                    .onChange(of: modelFocused) { _, focused in if !focused { saveModel() } }
                        }
                    }

                    if !service.id.isEmpty {
                        LabeledContent {
                            Button("Test") { model.testGenerator() }
                                .disabled(model.generatorTest == .running || !model.hasServiceKey)
                        } label: {
                            switch model.generatorTest {
                            case .idle: Text("Make today's picture")
                            case .running: HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Drawing…") }
                            case .passed(let scene): Label(scene.isEmpty ? "Opened in Preview" : scene, systemImage: "checkmark.circle")
                                .foregroundStyle(.green)
                                .lineLimit(1)
                                .truncationMode(.tail)
                            case .failed(let message): Text(message).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                } header: {
                    Text("Image service")
                } footer: {
                    Text("Recraft makes a fresh photograph each morning from a scene Inkwell picks; the quote is set over it in the paper's own type. If Recraft fails, the paper prints without it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onAppear { modelName = model.headlines.model }
                .onChange(of: model.headlines.service) { _, _ in modelName = model.headlines.model; apiKey = "" }
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
        .onAppear {
            model.headshotCount = InkwellPaths.headshotCount()
            model.refreshThemeLocks()
        }
        .frame(width: 540)
        .padding(20)
    }
}
