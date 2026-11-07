import AppKit
import InkwellCore
import SwiftUI

/// A compact line graph for the menu: the last fourteen days and tomorrow's
/// forecast, with the blurb underneath.
struct TrendMenuView: View {
    let trend: InkwellTrend
    let open: () -> Void

    @State private var hovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
                Text(trend.metric == "tokens" ? "TOKENS · LAST 14 DAYS" : "PROMPTS · LAST 14 DAYS")
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(1.1)
                    .foregroundStyle(.tertiary)
                Spacer()
                Text(trend.teaser)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(tint)
            }

            Sparkline(
                values: trend.days.map { $0.value(for: trend.metric) },
                forecast: trend.forecast.value(for: trend.metric)
            )
            .frame(height: 32)

            Text(menuBlurb)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(width: 380, alignment: .leading)
        .contentShape(Rectangle())
        .onTapGesture { open() }
        .onHover { hovering = $0 }
        .background(hovering ? Color.primary.opacity(0.06) : Color.clear)
    }

    private var tint: Color {
        switch trend.forecast.direction {
        case "up": return .green
        case "down": return .orange
        default: return .secondary
        }
    }

    private var menuBlurb: String {
        let unit = trend.metric == "tokens" ? "tokens" : "prompts"
        let total = trend.metric == "tokens" ? TrendFormat.tokens(trend.totalTokens) : String(trend.totalPrompts)
        let forecast = trend.metric == "tokens" ? TrendFormat.tokens(trend.forecast.tokens) : String(trend.forecast.prompts)
        let busiest = (trend.busiest ?? "").isEmpty ? "" : " \(trend.busiest!) is usually heaviest."
        return "\(total) \(unit) this fortnight. Tomorrow ~\(forecast)." + busiest
    }
}

struct Sparkline: View {
    let values: [Int]
    let forecast: Int

    var body: some View {
        Canvas { context, size in
            guard values.count > 1 else { return }
            let pad: CGFloat = 2
            let width = size.width - pad * 2
            let height = size.height - pad * 2
            let maxValue = max(1, values.max() ?? 0, forecast)
            let step = width / CGFloat(values.count)

            func point(_ index: Int, _ value: Int) -> CGPoint {
                CGPoint(
                    x: pad + CGFloat(index) * step,
                    y: pad + height - CGFloat(value) / CGFloat(maxValue) * height
                )
            }

            var line = Path()
            for (index, value) in values.enumerated() {
                let p = point(index, value)
                if index == 0 { line.move(to: p) } else { line.addLine(to: p) }
            }

            var area = line
            area.addLine(to: point(values.count - 1, 0))
            area.addLine(to: point(0, 0))
            area.closeSubpath()
            context.fill(area, with: .color(.accentColor.opacity(0.12)))
            context.stroke(
                line,
                with: .color(.accentColor),
                style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round)
            )

            var baseline = Path()
            baseline.move(to: point(0, 0))
            baseline.addLine(to: point(values.count - 1, 0))
            context.stroke(
                baseline,
                with: .color(Color(nsColor: .secondaryLabelColor).opacity(0.25)),
                style: StrokeStyle(lineWidth: 0.5, dash: [2, 3])
            )

            var forecastPath = Path()
            forecastPath.move(to: point(values.count - 1, values.last ?? 0))
            forecastPath.addLine(to: point(values.count, forecast))
            context.stroke(
                forecastPath,
                with: .color(.accentColor.opacity(0.7)),
                style: StrokeStyle(lineWidth: 1.2, dash: [3, 3])
            )

            let forecastPoint = point(values.count, forecast)
            context.fill(
                Path(ellipseIn: CGRect(x: forecastPoint.x - 2.2, y: forecastPoint.y - 2.2, width: 4.4, height: 4.4)),
                with: .color(.accentColor)
            )
        }
        .accessibilityLabel("Usage trend")
    }
}
