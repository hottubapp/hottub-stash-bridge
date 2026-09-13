"use strict";

const SORT_OPTIONS = [
  { id: "date", title: "Date", description: "Newest scenes first", stashSort: "date", direction: "DESC" },
  { id: "title", title: "Title", description: "Alphabetical by title", stashSort: "title", direction: "ASC" },
  { id: "rating", title: "Rating", description: "Highest rated first", stashSort: "rating", direction: "DESC" },
  { id: "random", title: "Random", description: "Shuffled order", stashSort: "random", direction: "ASC" },
  { id: "duration", title: "Duration", description: "Longest first", stashSort: "duration", direction: "DESC" },
  { id: "play_count", title: "Most Played", description: "Most played first", stashSort: "play_count", direction: "DESC" },
];

function buildStatus({ source, channelId, tags = [] }) {
  const tagChoices = tags
    .filter((t) => t?.id && t?.name)
    .slice(0, 80)
    .map((t) => ({
      id: String(t.id),
      title: t.name,
      description: t.scene_count != null ? `${t.scene_count} scenes` : undefined,
    }));

  const channelOptions = [
    {
      id: "sort",
      title: "Sort",
      systemImage: "arrow.up.arrow.down",
      colorName: "blue",
      multiSelect: false,
      options: SORT_OPTIONS.map(({ id, title, description }) => ({
        id,
        title,
        description,
      })),
    },
  ];

  if (tagChoices.length) {
    channelOptions.push({
      id: "tag",
      title: "Tag",
      systemImage: "tag",
      colorName: "orange",
      multiSelect: false,
      options: [
        { id: "any", title: "Any", description: "All tags" },
        ...tagChoices,
      ],
    });
  }

  channelOptions.push({
    id: "studio_only",
    title: "Has Studio",
    systemImage: "building.2",
    colorName: "purple",
    multiSelect: false,
    options: [
      { id: "any", title: "Any", description: "Include all scenes" },
      { id: "yes", title: "With studio", description: "Only scenes with a studio" },
    ],
  });

  return {
    id: source.id,
    name: source.name,
    subtitle: source.subtitle,
    description: source.description,
    color: source.color,
    status: "active",
    notices: [],
    nsfw: true,
    channels: [
      {
        id: channelId,
        name: source.name,
        description: source.description,
        premium: false,
        status: "active",
        nsfw: true,
        categories: [],
        options: channelOptions,
        cacheDuration: 300,
      },
    ],
    options: [
      {
        id: "sort",
        title: "Sort",
        systemImage: "arrow.up.arrow.down",
        colorName: "blue",
        multiSelect: false,
        options: SORT_OPTIONS.map(({ id, title, description }) => ({
          id,
          title,
          description,
        })),
      },
    ],
    popup: null,
  };
}

function resolveSort(sortId) {
  const found = SORT_OPTIONS.find((s) => s.id === sortId);
  return found || SORT_OPTIONS[0];
}

module.exports = { buildStatus, resolveSort, SORT_OPTIONS };
