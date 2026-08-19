export type UserWsTags = WsTag[];

export type WsTag = {
  id: string;
  slug: string;
  color?: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
};

export type WorkspaceTag = { id: string; name: string; slug: string };

export type CreateTagDTO = {
  projectId: string;
  tagSlug: string;
  tagColor: string;
};

export type DeleteTagDTO = { tagID: string; projectId: string };

export type SecretTags = {
  id: string;
  slug: string;
  tagColor: string;
};

export type TModifySecretTagsDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  secretKey: string;
  tagSlugs: string[];
};

export type SecretTagsResponse = {
  secretName: string;
  tags: { id: string; slug: string; name: string; color?: string }[];
};

export type TagColor = {
  id: number;
  hex: string;
  rgba: string;
  name: string;
  selected: boolean;
};
