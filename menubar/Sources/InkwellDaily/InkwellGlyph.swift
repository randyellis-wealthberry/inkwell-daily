import AppKit

/// The menu bar mark: a filled mid-century inkwell with its lid ajar, drawn
/// as a template image so macOS picks the menu bar's own black or white.
enum InkwellGlyph {
    static func menuBar(unread: Bool) -> NSImage {
        let size = NSSize(width: 18, height: 18)
        let image = NSImage(size: size, flipped: false) { rect in
            NSColor.clear.setFill()
            rect.fill()

            let scale = size.width / 24.0
            func point(_ x: CGFloat, _ y: CGFloat) -> NSPoint {
                NSPoint(x: x * scale, y: y * scale)
            }

            NSColor.black.setFill()

            // Low, asymmetric pebble body.
            let body = NSBezierPath()
            body.move(to: point(4.2, 11.0))
            body.curve(to: point(10.0, 4.8), controlPoint1: point(4.2, 7.0), controlPoint2: point(6.4, 5.0))
            body.line(to: point(15.2, 4.8))
            body.curve(to: point(20.0, 9.0), controlPoint1: point(18.0, 4.8), controlPoint2: point(19.6, 6.4))
            body.curve(to: point(17.0, 14.0), controlPoint1: point(20.4, 11.6), controlPoint2: point(19.4, 13.2))
            body.line(to: point(7.6, 14.0))
            body.curve(to: point(4.2, 11.0), controlPoint1: point(5.4, 13.4), controlPoint2: point(4.2, 12.4))
            body.close()
            body.fill()

            // Offset neck.
            let neck = NSBezierPath()
            neck.move(to: point(13.0, 13.2))
            neck.line(to: point(17.8, 13.2))
            neck.line(to: point(18.4, 16.0))
            neck.line(to: point(12.4, 16.0))
            neck.close()
            neck.fill()

            // Open lid, tilted off the neck.
            let lid = NSBezierPath()
            lid.lineWidth = 2.2 * scale
            lid.lineCapStyle = .round
            lid.move(to: point(13.0, 16.6))
            lid.line(to: point(21.0, 18.8))
            lid.stroke()

            // Finial on the lid.
            NSBezierPath(ovalIn: NSRect(
                x: 20.4 * scale, y: 18.2 * scale,
                width: 2.4 * scale, height: 2.4 * scale
            )).fill()

            // Flat foot.
            NSBezierPath(
                roundedRect: NSRect(x: 3.2 * scale, y: 2.8 * scale, width: 18.0 * scale, height: 1.8 * scale),
                xRadius: 0.9 * scale,
                yRadius: 0.9 * scale
            ).fill()

            if unread {
                NSBezierPath(ovalIn: NSRect(
                    x: 1.4 * scale, y: 19.6 * scale,
                    width: 2.4 * scale, height: 2.4 * scale
                )).fill()
            }

            return true
        }
        image.isTemplate = true
        return image
    }
}
