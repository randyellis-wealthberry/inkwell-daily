import AppKit
import InkwellCore
import SwiftUI

/// The Pro sheet the paper's desk links open. Two independent choices:
/// where the data comes from (Inkwell's hosted desk or the reader's Claude
/// connector) and which model sorts it (Inkwell included or the reader's
/// Claude subscription). The Composio key stays on the proxy.
struct ProSettingsView: View {
    let model: InkwellModel
    let request: DeskRequest?

    @State private var data: String
    @State private var modelName: String
    @State private var proxyUrl: String
    @State private var license: String

    init(model: InkwellModel, request: DeskRequest?) {
        self.model = model
        self.request = request
        _data = State(initialValue: model.desk.data)
        _modelName = State(initialValue: model.desk.model)
        _proxyUrl = State(initialValue: model.desk.proxyUrl)
        _license = State(initialValue: model.desk.license)
    }

    private func save() {
        var next = DeskSettings()
        next.data = data
        next.model = data == "claude" ? "claude" : modelName
        next.proxyUrl = proxyUrl
        next.license = license
        model.setDesk(next)
    }

    var body: some View {
        Form {
            Section("Inkwell Daily Pro") {
                Text("Five desks, read through your own connection and set beside your agent work. Read-only; nothing is posted.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                if let request {
                    LabeledContent("Desk", value: request.name)
                    LabeledContent("Action", value: request.actionLabel)
                    Text(request.instruction)
                        .font(.callout)
                }
            }

            Section("Data") {
                Picker("Desk data", selection: $data) {
                    Text("Inkwell hosted · included").tag("composio")
                    Text("Your Claude connector").tag("claude")
                }
                if data == "composio" {
                    TextField("Hosted proxy", text: $proxyUrl)
                    TextField("Pro license", text: $license)
                    Text("The proxy holds Inkwell's Composio key; your license maps to your own connected account. Connect Gmail for this desk in Composio, then set a new edition.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Gmail is read through your own Claude connector. The data stays in Claude; nothing is posted.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Model") {
                Picker("Sorts the mail", selection: $modelName) {
                    Text("Inkwell included").tag("inkwell")
                    Text("Your Claude subscription").tag("claude")
                    Text("Your OpenAI subscription · coming soon").tag("openai").selectionDisabled()
                }
                .disabled(data == "claude")
                Text(data == "claude"
                     ? "The Claude connector uses Claude."
                     : "Inkwell's included shaping is free; your subscription sorts the hosted mail with your own account.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if data == "composio" {
                Section("Hosted connection") {
                    HStack {
                        Text("Gmail")
                        Spacer()
                        Text(model.hosted.label)
                            .foregroundStyle(model.hosted.connected ? Color.green : Color.gray)
                    }
                    HStack {
                        Button(model.hosted.connected ? "Reconnect Gmail" : "Connect Gmail") {
                            save()
                            model.connectHosted()
                        }
                        .disabled(model.isConnecting)
                        Button("Refresh") {
                            save()
                            model.refreshHosted()
                        }
                        if model.isConnecting {
                            ProgressView().controlSize(.small)
                        }
                    }
                    if let error = model.hosted.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    Text("The Connect Link opens Composio; finish the Gmail sign-in there, then the paper picks it up.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                HStack {
                    Button("Save") { save() }
                    Button("Set a new edition") {
                        save()
                        model.buildNow()
                    }
                    .disabled(model.isBuilding)
                    if model.isBuilding {
                        ProgressView().controlSize(.small)
                    }
                    Spacer()
                    if data == "composio" {
                        Button("Open Composio") {
                            if let url = URL(string: "https://app.composio.dev") { NSWorkspace.shared.open(url) }
                        }
                    } else {
                        Button("Open Claude") {
                            if let url = URL(string: "https://claude.ai") { NSWorkspace.shared.open(url) }
                        }
                    }
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 520, height: 540)
        .onAppear { model.refreshHosted() }
    }
}
