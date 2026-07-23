import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const login = process.argv[2] ?? "arpagon";
const outputDirectory = process.argv[3] ?? "assets";
const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("GITHUB_TOKEN is required");
}

const query = `
  query ContributionCalendar($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              contributionLevel
              date
              weekday
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": `${login}-profile-contribution-graph`,
  },
  body: JSON.stringify({ query, variables: { login } }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(`GitHub GraphQL error: ${JSON.stringify(payload.errors)}`);
}

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) {
  throw new Error(`No contribution calendar returned for ${login}`);
}

const themes = {
  dark: {
    background: "#0d1117",
    border: "#30363d",
    text: "#f0f6fc",
    muted: "#8b949e",
    levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  },
  light: {
    background: "#ffffff",
    border: "#d0d7de",
    text: "#1f2328",
    muted: "#656d76",
    levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  },
};

const levelIndexes = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const width = 1200;
const height = 310;
const chartLeft = 98;
const chartTop = 92;
const cellSize = 15;
const cellGap = 4;
const cellStep = cellSize + cellGap;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function render(themeName, theme) {
  const cells = [];
  const monthLabels = [];
  let previousMonth = null;

  calendar.weeks.forEach((week, weekIndex) => {
    const firstDay = week.contributionDays[0];
    if (firstDay) {
      const month = Number(firstDay.date.slice(5, 7)) - 1;
      if (month !== previousMonth) {
        monthLabels.push({ label: monthNames[month], x: chartLeft + weekIndex * cellStep });
        previousMonth = month;
      }
    }

    week.contributionDays.forEach((day) => {
      const x = chartLeft + weekIndex * cellStep;
      const y = chartTop + day.weekday * cellStep;
      const color = theme.levels[levelIndexes[day.contributionLevel] ?? 0];
      const noun = day.contributionCount === 1 ? "contribution" : "contributions";
      cells.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="3" fill="${color}"><title>${day.contributionCount} ${noun} on ${escapeXml(day.date)}</title></rect>`,
      );
    });
  });

  const months = monthLabels
    .map(({ label, x }) => `<text x="${x}" y="78" fill="${theme.text}" font-size="16">${label}</text>`)
    .join("");

  const legendX = width - 305;
  const legendCells = theme.levels
    .map((color, index) => `<rect x="${legendX + 58 + index * cellStep}" y="266" width="${cellSize}" height="${cellSize}" rx="3" fill="${color}"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${calendar.totalContributions.toLocaleString("en-US")} contributions in the last year</title>
  <desc id="desc">GitHub contribution calendar for ${escapeXml(login)}, updated automatically.</desc>
  <rect width="${width}" height="${height}" rx="18" fill="${theme.background}"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="17" fill="none" stroke="${theme.border}" stroke-width="2"/>
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif">
    <text x="32" y="43" fill="${theme.text}" font-size="24" font-weight="600">${calendar.totalContributions.toLocaleString("en-US")} contributions in the last year</text>
    ${months}
    <text x="32" y="${chartTop + cellStep + 12}" fill="${theme.text}" font-size="16">Mon</text>
    <text x="32" y="${chartTop + cellStep * 3 + 12}" fill="${theme.text}" font-size="16">Wed</text>
    <text x="32" y="${chartTop + cellStep * 5 + 12}" fill="${theme.text}" font-size="16">Fri</text>
    ${cells.join("")}
    <text x="32" y="280" fill="${theme.muted}" font-size="15">Built in public · updated daily</text>
    <text x="${legendX}" y="280" fill="${theme.muted}" font-size="15">Less</text>
    ${legendCells}
    <text x="${legendX + 165}" y="280" fill="${theme.muted}" font-size="15">More</text>
  </g>
</svg>\n`;
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  Object.entries(themes).map(([themeName, theme]) =>
    writeFile(path.join(outputDirectory, `contribution-graph-${themeName}.svg`), render(themeName, theme)),
  ),
);

console.log(`Generated contribution graphs for ${login}: ${calendar.totalContributions} contributions`);
