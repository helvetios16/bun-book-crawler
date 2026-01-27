import type { JSX } from "react";
import { useEffect, useState } from "react";
import { BACKGROUND_ICONS } from "../../../config/icons";
import { COLORS } from "../../../config/tui-colors";

interface Particle {
  id: string;
  x: number;
  y: number;
  dx: number;
  icon: string;
  speed: number;
}

interface IconBackgroundProps {
  readonly intensity?: number;
  readonly speed?: number;
  readonly children: React.ReactNode;
}

export function IconBackground({
  intensity = 15,
  speed = 150,
  children,
}: IconBackgroundProps): JSX.Element {
  // Static dimensions to avoid constant resizing logic for now.
  const maxWidth = process.stdout.columns || 80;
  const maxHeight = process.stdout.rows || 24;

  const [particles, setParticles] = useState<Particle[]>(() => {
    return Array.from({ length: intensity }).map((_, i) => ({
      id: `particle-${i}`,
      x: Math.floor(Math.random() * maxWidth),
      y: Math.floor(Math.random() * maxHeight),
      dx: Math.floor(Math.random() * 3) - 1, // -1, 0, or 1
      icon: BACKGROUND_ICONS[Math.floor(Math.random() * BACKGROUND_ICONS.length)],
      speed: Math.random() > 0.5 ? 1 : 0.5,
    }));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles((prevParticles) =>
        prevParticles.map((p) => {
          let newX = p.x + p.dx;
          const newY = p.y + 1;

          // Simple random direction change occasionally to make it feel more organic
          const newDx = Math.random() < 0.1 ? Math.floor(Math.random() * 3) - 1 : p.dx;

          if (newY >= maxHeight || newX < 0 || newX >= maxWidth) {
            // Reset if out of bounds (bottom or sides) - or maybe just wrap sides?
            // Let's reset if hits bottom, wrap sides for smoother feel.
            if (newY >= maxHeight) {
              return {
                ...p,
                y: 0,
                x: Math.floor(Math.random() * maxWidth),
                dx: Math.floor(Math.random() * 3) - 1,
                icon: BACKGROUND_ICONS[Math.floor(Math.random() * BACKGROUND_ICONS.length)],
              };
            }

            // Wrap sides
            if (newX < 0) {
              newX = maxWidth - 1;
            }
            if (newX >= maxWidth) {
              newX = 0;
            }
          }

          return { ...p, x: newX, y: newY, dx: newDx };
        }),
      );
    }, speed);

    return () => clearInterval(interval);
  }, [maxHeight, maxWidth, speed]);

  return (
    <box width="100%" height="100%">
      {/* Background Layer */}
      {particles.map((p) => (
        <box key={p.id} position="absolute" left={p.x} top={p.y}>
          <text fg={COLORS.BACKGROUND_ICON}>{p.icon}</text>
        </box>
      ))}

      {/* Content Layer */}
      <box width="100%" height="100%" flexDirection="column">
        {children}
      </box>
    </box>
  );
}
