import Charts
import InkwellCore
import SwiftUI

struct TrendWindowView: View {
    let trend: InkwellTrend

    @State private var metric: String

    init(trend: InkwellTrend) {
        self.trend = trend
        _metric = State(initialValue: trend.metric)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(trend.headline)
                        .font(.title2.bold())
                    Text(trend.blurb)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer()

                Picker("Metric", selection: $metric) {
                    Text("Tokens").tag("tokens")
                    Text("Prompts").tag("prompts")
                }
                .pickerStyle(.segmented)
                .frame(width: 180)
            }

            Chart {
                ForEach(trend.days) { day in
                    AreaMark(
                        x: .value("Day", day.dateValue),
                        y: .value("Usage", day.value(for: metric))
                    )
                    .foregroundStyle(Color.accentColor.opacity(0.12))
                    .interpolationMethod(.catmullRom)

                    LineMark(
                        x: .value("Day", day.dateValue),
                        y: .value("Usage", day.value(for: metric))
                    )
                    .foregroundStyle(Color.accentColor)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.catmullRom)

                    PointMark(
                        x: .value("Day", day.dateValue),
                        y: .value("Usage", day.value(for: metric))
                    )
                    .foregroundStyle(Color.accentColor)
                    .symbolSize(14)
                }

                RuleMark(y: .value("Forecast", trend.forecast.value(for: metric)))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .foregroundStyle(.secondary)
                    .annotation(position: .top, alignment: .trailing) {
                        Text("Tomorrow · \(formatted(trend.forecast.value(for: metric)))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: .day, count: 2)) { _ in
                    AxisGridLine()
                        .foregroundStyle(.quaternary)
                    AxisValueLabel(format: .dateTime.weekday(.abbreviated))
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisGridLine()
                        .foregroundStyle(.quaternary)
                    AxisValueLabel {
                        if let number = value.as(Int.self) {
                            Text(formatted(number))
                        }
                    }
                }
            }
            .frame(height: 230)

            HStack(spacing: 28) {
                stat("Tokens", TrendFormat.tokens(trend.totalTokens))
                stat("A day", formatted(Int(metric == "tokens" ? trend.averageTokens : trend.averagePrompts)))
                stat("Prompts", String(trend.totalPrompts))
                stat("Heaviest", trend.busiest?.isEmpty == false ? trend.busiest! : "—")
            }

            Text("The forecast is for \(trend.forecast.day).")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(24)
        .frame(width: 600)
    }

    private func formatted(_ number: Int) -> String {
        metric == "tokens" ? TrendFormat.tokens(number) : String(number)
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(.title3, design: .rounded, weight: .semibold))
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
