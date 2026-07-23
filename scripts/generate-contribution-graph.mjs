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
    accent: "#ff6268",
    top: ["#202833", "#51252a", "#843039", "#c5424b", "#ff6268"],
    left: ["#11161c", "#35181c", "#572027", "#842c33", "#aa3f45"],
    right: ["#171e26", "#421e22", "#6c2730", "#a3353e", "#d34b51"],
  },
  light: {
    background: "#fffafa",
    border: "#d8cfd0",
    text: "#302a3e",
    muted: "#736a79",
    accent: "#ff5258",
    top: ["#eef1f4", "#ffd8da", "#ffadb1", "#ff7f85", "#ff5258"],
    left: ["#d7dce2", "#d8afb2", "#d4888d", "#c85e65", "#bb3c43"],
    right: ["#e2e6eb", "#e9c1c4", "#e99a9f", "#e66e74", "#dc474e"],
  },
};

const levelIndexes = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const width = 1200;
const height = 480;
const originX = 150;
const originY = 170;
const halfTileWidth = 17;
const halfTileHeight = 4.5;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function points(...coordinates) {
  return coordinates.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function renderBuilding(cell, theme) {
  const { x, y, day } = cell;
  const level = levelIndexes[day.contributionLevel] ?? 0;
  const buildingHeight = day.contributionCount === 0
    ? 0
    : Math.min(68, 7 + Math.round(Math.log2(day.contributionCount + 1) * 11));
  const topY = y - buildingHeight;
  const noun = day.contributionCount === 1 ? "contribution" : "contributions";
  const tooltip = `${day.contributionCount} ${noun} on ${escapeXml(day.date)}`;

  const top = points(
    [x, topY - halfTileHeight],
    [x + halfTileWidth, topY],
    [x, topY + halfTileHeight],
    [x - halfTileWidth, topY],
  );

  if (buildingHeight === 0) {
    return `<g><title>${tooltip}</title><polygon points="${top}" fill="${theme.top[0]}" stroke="${theme.border}" stroke-width="0.8"/></g>`;
  }

  const left = points(
    [x - halfTileWidth, topY],
    [x, topY + halfTileHeight],
    [x, y + halfTileHeight],
    [x - halfTileWidth, y],
  );
  const right = points(
    [x + halfTileWidth, topY],
    [x, topY + halfTileHeight],
    [x, y + halfTileHeight],
    [x + halfTileWidth, y],
  );

  return `<g><title>${tooltip}</title><polygon points="${left}" fill="${theme.left[level]}"/><polygon points="${right}" fill="${theme.right[level]}"/><polygon points="${top}" fill="${theme.top[level]}" stroke="${theme.accent}" stroke-opacity="0.28" stroke-width="0.7"/></g>`;
}

function renderCity(theme) {
  const cells = [];

  calendar.weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
      cells.push({
        day,
        x: originX + (weekIndex - day.weekday) * halfTileWidth,
        y: originY + (weekIndex + day.weekday) * halfTileHeight,
      });
    });
  });

  cells.sort((left, right) => left.y - right.y || left.x - right.x);
  const buildings = cells.map((cell) => renderBuilding(cell, theme)).join("");
  const legendX = 927;
  const legend = theme.top
    .map((color, index) => `<polygon points="${points(
      [legendX + index * 34, 446],
      [legendX + index * 34 + 12, 452],
      [legendX + index * 34, 458],
      [legendX + index * 34 - 12, 452],
    )}" fill="${color}"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${calendar.totalContributions.toLocaleString("en-US")} contributions in the last year</title>
  <desc id="desc">An isometric contribution city for ${escapeXml(login)}, where building height represents daily GitHub activity.</desc>
  <rect width="${width}" height="${height}" rx="18" fill="${theme.background}"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="17" fill="none" stroke="${theme.border}" stroke-width="2"/>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">
    <circle cx="35" cy="34" r="5" fill="${theme.accent}"/>
    <text x="51" y="40" fill="${theme.muted}" font-size="14" letter-spacing="2">CONTRIBUTION CITY / LAST 12 MONTHS</text>
    <text x="34" y="78" fill="${theme.text}" font-size="29" font-weight="700">${calendar.totalContributions.toLocaleString("en-US")} contributions</text>
    ${buildings}
    <text x="34" y="458" fill="${theme.muted}" font-size="14">BUILT IN PUBLIC · UPDATED DAILY</text>
    <text x="850" y="457" fill="${theme.muted}" font-size="13">LESS</text>
    ${legend}
    <text x="1092" y="457" fill="${theme.muted}" font-size="13">MORE</text>
  </g>
</svg>\n`;
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  Object.entries(themes).map(([themeName, theme]) =>
    writeFile(path.join(outputDirectory, `contribution-city-${themeName}.svg`), renderCity(theme)),
  ),
);

console.log(`Generated contribution city for ${login}: ${calendar.totalContributions} contributions`);
