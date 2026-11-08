import SwiftUI

/// The strip above the paper: pick a theme and font to preview them on the
/// page, then Apply Theme to keep them. Nothing is saved until you apply.
struct PaperBar: View {
    let model: InkwellModel

    var body: some View {
        HStack(spacing: 12) {
            Picker("Theme", selection: Binding(get: { model.draftTheme }, set: { model.previewTheme($0) })) {
                ForEach(InkwellTheme.all) { theme in
                    if let left = model.themeLocks[theme.id] {
                        Text("\(theme.name) · \(left) more \(left == 1 ? "morning" : "mornings")").tag(theme.id).selectionDisabled()
                    } else {
                        Text(theme.name).tag(theme.id)
                    }
                }
            }
            .fixedSize()

            Picker("Font", selection: Binding(get: { model.draftFont }, set: { model.previewFont($0) })) {
                ForEach(InkwellFont.all) { font in
                    Text(font.name).tag(font.id)
                }
            }
            .fixedSize()

            Picker("Style", selection: Binding(get: { model.draftLook }, set: { model.previewLook($0) })) {
                ForEach(PaperLook.all) { look in
                    Text(look.name).tag(look.id)
                }
            }
            .fixedSize()

            Spacer()

            if model.isApplying {
                ProgressView().controlSize(.small)
                Text("Applying…").foregroundStyle(.secondary)
            } else if model.hasDraft {
                Text("Previewing").foregroundStyle(.secondary)
                Button("Revert") { model.revertDraft() }
            }

            Button("Apply Theme") { model.applyDraft() }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(!model.hasDraft || model.isApplying || model.isBuilding)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.bar)
    }
}
