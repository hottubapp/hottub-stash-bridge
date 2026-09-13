"use strict";

const SCENE_FIELDS = `
  id
  title
  code
  details
  date
  rating100
  o_counter
  play_count
  urls
  files {
    duration
    width
    height
    path
    basename
  }
  paths {
    screenshot
    preview
    stream
  }
  studio {
    id
    name
    image_path
    url
    scene_count
    details
  }
  tags {
    id
    name
  }
  performers {
    id
    name
    image_path
    scene_count
    details
    urls
  }
  scene_markers {
    id
    title
    seconds
    end_seconds
    primary_tag {
      id
      name
    }
  }
`;

const FIND_SCENES = `
  query FindScenes($filter: FindFilterType, $scene_filter: SceneFilterType) {
    findScenes(filter: $filter, scene_filter: $scene_filter) {
      count
      scenes {
        ${SCENE_FIELDS}
      }
    }
  }
`;

const FIND_SCENE = `
  query FindScene($id: ID!) {
    findScene(id: $id) {
      ${SCENE_FIELDS}
    }
  }
`;

const FIND_PERFORMER = `
  query FindPerformer($id: ID!) {
    findPerformer(id: $id) {
      id
      name
      details
      image_path
      scene_count
      urls
      favorite
    }
  }
`;

const FIND_PERFORMERS = `
  query FindPerformers($filter: FindFilterType) {
    findPerformers(filter: $filter) {
      count
      performers {
        id
        name
        details
        image_path
        scene_count
        urls
      }
    }
  }
`;

const FIND_STUDIO = `
  query FindStudio($id: ID!) {
    findStudio(id: $id) {
      id
      name
      details
      image_path
      url
      scene_count
    }
  }
`;

const FIND_TAGS = `
  query FindTags($filter: FindFilterType) {
    findTags(filter: $filter) {
      count
      tags {
        id
        name
        scene_count
      }
    }
  }
`;

const SYSTEM_STATUS = `
  query SystemStatus {
    systemStatus {
      status
      databaseSchema
      appSchema
    }
  }
`;

module.exports = {
  FIND_SCENES,
  FIND_SCENE,
  FIND_PERFORMER,
  FIND_PERFORMERS,
  FIND_STUDIO,
  FIND_TAGS,
  SYSTEM_STATUS,
};
