import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import {
  graphql,
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLNonNull,
  validate,
  parse,
} from 'graphql';
import { UUIDType } from './types/uuid.js';
import type { Post, Profile, User, MemberType } from '@prisma/client';
import depthLimit from 'graphql-depth-limit';
import DataLoader from 'dataloader';
import { parseResolveInfo } from 'graphql-parse-resolve-info';

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  const MemberTypeIdGQL = new GraphQLEnumType({
    name: 'MemberTypeId',
    values: {
      BASIC: { value: 'BASIC' },
      BUSINESS: { value: 'BUSINESS' },
    },
  });

  const CreateUserInput = new GraphQLInputObjectType({
    name: 'CreateUserInput',
    fields: {
      name: { type: new GraphQLNonNull(GraphQLString) },
      balance: { type: new GraphQLNonNull(GraphQLFloat) },
    },
  });

  const CreateProfileInput = new GraphQLInputObjectType({
    name: 'CreateProfileInput',
    fields: {
      isMale: { type: new GraphQLNonNull(GraphQLBoolean) },
      yearOfBirth: { type: new GraphQLNonNull(GraphQLInt) },
      userId: { type: new GraphQLNonNull(UUIDType) },
      memberTypeId: { type: new GraphQLNonNull(MemberTypeIdGQL) },
    },
  });

  const CreatePostInput = new GraphQLInputObjectType({
    name: 'CreatePostInput',
    fields: {
      title: { type: new GraphQLNonNull(GraphQLString) },
      content: { type: new GraphQLNonNull(GraphQLString) },
      authorId: { type: new GraphQLNonNull(UUIDType) },
    },
  });

  const ChangeUserInput = new GraphQLInputObjectType({
    name: 'ChangeUserInput',
    fields: {
      name: { type: GraphQLString },
      balance: { type: GraphQLFloat },
    },
  });

  const ChangeProfileInput = new GraphQLInputObjectType({
    name: 'ChangeProfileInput',
    fields: {
      isMale: { type: GraphQLBoolean },
      yearOfBirth: { type: GraphQLInt },
      memberTypeId: { type: MemberTypeIdGQL },
    },
  });

  const ChangePostInput = new GraphQLInputObjectType({
    name: 'ChangePostInput',
    fields: {
      title: { type: GraphQLString },
      content: { type: GraphQLString },
    },
  });

  const groupBy = <T>(array: T[], key: keyof T): Record<string, T[]> => {
    return array.reduce(
      (acc, item) => {
        const groupKey = String(item[key]);
        if (!acc[groupKey]) {
          acc[groupKey] = [];
        }
        acc[groupKey].push(item);
        return acc;
      },
      {} as Record<string, T[]>,
    );
  };

  const PostGQL = new GraphQLObjectType({
    name: 'Post',
    fields: () => ({
      id: { type: UUIDType },
      title: { type: GraphQLString },
      content: { type: GraphQLString },
      authorId: { type: UUIDType },
      author: {
        type: UserGQL as GraphQLObjectType,
        resolve: async (post: Post, _, context: Context) => {
          return await context.loaders.userLoader.load(post.authorId);
        },
      },
    }),
  });

  const ProfileGQL = new GraphQLObjectType({
    name: 'Profile',
    fields: () => ({
      id: { type: UUIDType },
      isMale: { type: GraphQLBoolean },
      yearOfBirth: { type: GraphQLInt },
      memberTypeId: { type: GraphQLString },
      userId: { type: UUIDType },
      user: {
        type: UserGQL as GraphQLObjectType,
        resolve: async (profile: Profile, _, context: Context) => {
          return await context.loaders.userLoader.load(profile.userId);
        },
      },
      memberType: {
        type: MemberTypeGQL,
        resolve: async (profile: Profile, _, context: Context) => {
          return await context.loaders.memberTypeLoader.load(profile.memberTypeId);
        },
      },
    }),
  });

  const UserGQL = new GraphQLObjectType({
    name: 'User',
    fields: () => ({
      id: { type: UUIDType },
      name: { type: GraphQLString },
      balance: { type: GraphQLFloat },
      posts: {
        type: new GraphQLList(PostGQL),
        resolve: async (user: User, _, context: Context, resolveInfo) => {
          const parsedResolveInfo = parseResolveInfo(resolveInfo);
          const shouldLoadPosts = parsedResolveInfo?.fieldsByTypeName.Post;

          if (!shouldLoadPosts) return [];

          return await context.loaders.postsByAuthorIdLoader.load(user.id);
        },
      },
      profile: {
        type: ProfileGQL as GraphQLObjectType,
        resolve: async (user: User, _, context: Context, resolveInfo) => {
          const parsedResolveInfo = parseResolveInfo(resolveInfo);
          const shouldLoadProfile = parsedResolveInfo?.fieldsByTypeName.Profile;

          if (!shouldLoadProfile) return null;

          return await context.loaders.profileByUserIdLoader.load(user.id);
        },
      },
      userSubscribedTo: {
        type: new GraphQLList(UserGQL),
        resolve: async (user: User, _, context: Context, resolveInfo) => {
          const parsedResolveInfo = parseResolveInfo(resolveInfo);
          const shouldLoadSubscriptions = parsedResolveInfo?.fieldsByTypeName.User;

          if (!shouldLoadSubscriptions) return [];

          return await context.loaders.userSubscribedToLoader.load(user.id);
        },
      },
      subscribedToUser: {
        type: new GraphQLList(UserGQL),
        resolve: async (user: User, _, context: Context, resolveInfo) => {
          const parsedResolveInfo = parseResolveInfo(resolveInfo);
          const shouldLoadSubscribers = parsedResolveInfo?.fieldsByTypeName.User;

          if (!shouldLoadSubscribers) return [];

          return await context.loaders.subscribedToUserLoader.load(user.id);
        },
      },
    }),
  });

  const MemberTypeGQL = new GraphQLObjectType({
    name: 'MemberType',
    fields: {
      id: { type: GraphQLString },
      discount: { type: GraphQLFloat },
      postsLimitPerMonth: { type: GraphQLInt },
    },
  });

  const RootQuery = new GraphQLObjectType({
    name: 'RootQueryType',
    fields: {
      memberTypes: {
        type: new GraphQLList(MemberTypeGQL),
        resolve: async () => await prisma.memberType.findMany(),
      },
      memberType: {
        type: MemberTypeGQL,
        args: { id: { type: MemberTypeIdGQL } },
        resolve: async (_: unknown, { id }: { id: string }) =>
          await prisma.memberType.findUnique({ where: { id } }),
      },
      posts: {
        type: new GraphQLList(PostGQL),
        resolve: async () => await prisma.post.findMany(),
      },
      post: {
        type: PostGQL as GraphQLObjectType,
        args: { id: { type: UUIDType } },
        resolve: async (_: unknown, { id }: { id: string }) =>
          await prisma.post.findUnique({ where: { id } }),
      },
      profiles: {
        type: new GraphQLList(ProfileGQL),
        resolve: async () => await prisma.profile.findMany(),
      },
      profile: {
        type: ProfileGQL as GraphQLObjectType,
        args: { id: { type: UUIDType } },
        resolve: async (_: unknown, { id }: { id: string }) =>
          await prisma.profile.findUnique({ where: { id } }),
      },
      users: {
        type: new GraphQLList(UserGQL),
        resolve: async () => await prisma.user.findMany(),
      },
      user: {
        type: UserGQL as GraphQLObjectType,
        args: { id: { type: UUIDType } },
        resolve: async (_: unknown, { id }: { id: string }) =>
          await prisma.user.findUnique({ where: { id } }),
      },
    },
  });

  const Mutations = new GraphQLObjectType({
    name: 'Mutations',
    fields: {
      createUser: {
        type: UserGQL as GraphQLObjectType,
        args: {
          dto: { type: new GraphQLNonNull(CreateUserInput) },
        },
        resolve: async (_, { dto }: { dto: { name: string; balance: number } }) => {
          return await prisma.user.create({
            data: dto,
          });
        },
      },
      createProfile: {
        type: ProfileGQL as GraphQLObjectType,
        args: {
          dto: { type: new GraphQLNonNull(CreateProfileInput) },
        },
        resolve: async (
          _,
          {
            dto,
          }: {
            dto: {
              isMale: boolean;
              yearOfBirth: number;
              userId: string;
              memberTypeId: string;
            };
          },
        ) => {
          return await prisma.profile.create({
            data: dto,
          });
        },
      },
      createPost: {
        type: PostGQL as GraphQLObjectType,
        args: {
          dto: { type: new GraphQLNonNull(CreatePostInput) },
        },
        resolve: async (
          _,
          { dto }: { dto: { title: string; content: string; authorId: string } },
        ) => {
          return await prisma.post.create({
            data: dto,
          });
        },
      },
      changeUser: {
        type: UserGQL as GraphQLObjectType,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
          dto: { type: new GraphQLNonNull(ChangeUserInput) },
        },
        resolve: async (
          _,
          { id, dto }: { id: string; dto: { name?: string; balance?: number } },
        ) => {
          return await prisma.user.update({
            where: { id },
            data: dto,
          });
        },
      },
      changeProfile: {
        type: ProfileGQL as GraphQLObjectType,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
          dto: { type: new GraphQLNonNull(ChangeProfileInput) },
        },
        resolve: async (
          _,
          {
            id,
            dto,
          }: {
            id: string;
            dto: { isMale?: boolean; yearOfBirth?: number; memberTypeId?: string };
          },
        ) => {
          return await prisma.profile.update({
            where: { id },
            data: dto,
          });
        },
      },
      changePost: {
        type: PostGQL as GraphQLObjectType,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
          dto: { type: new GraphQLNonNull(ChangePostInput) },
        },
        resolve: async (
          _,
          { id, dto }: { id: string; dto: { title?: string; content?: string } },
        ) => {
          return await prisma.post.update({
            where: { id },
            data: dto,
          });
        },
      },
      deleteUser: {
        type: GraphQLString,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: async (_, { id }: { id: string }) => {
          await prisma.user.delete({
            where: { id },
          });
          return id;
        },
      },
      deleteProfile: {
        type: GraphQLString,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: async (_, { id }: { id: string }) => {
          await prisma.profile.delete({
            where: { id },
          });
          return id;
        },
      },
      deletePost: {
        type: GraphQLString,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: async (_, { id }: { id: string }) => {
          await prisma.post.delete({
            where: { id },
          });
          return id;
        },
      },
      subscribeTo: {
        type: GraphQLString,
        args: {
          userId: { type: new GraphQLNonNull(UUIDType) },
          authorId: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: async (
          _,
          { userId, authorId }: { userId: string; authorId: string },
        ) => {
          await prisma.subscribersOnAuthors.create({
            data: {
              subscriberId: userId,
              authorId: authorId,
            },
          });
          return authorId;
        },
      },
      unsubscribeFrom: {
        type: GraphQLString,
        args: {
          userId: { type: new GraphQLNonNull(UUIDType) },
          authorId: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: async (
          _,
          { userId, authorId }: { userId: string; authorId: string },
        ) => {
          await prisma.subscribersOnAuthors.delete({
            where: {
              subscriberId_authorId: {
                subscriberId: userId,
                authorId: authorId,
              },
            },
          });
          return authorId;
        },
      },
    },
  });

  const schema = new GraphQLSchema({
    query: RootQuery,
    mutation: Mutations,
  });

  interface Context {
    prisma: typeof prisma;
    loaders: {
      userLoader: DataLoader<string, User | null>;
      memberTypeLoader: DataLoader<string, MemberType | null>;
      postsByAuthorIdLoader: DataLoader<string, Post[]>;
      profileByUserIdLoader: DataLoader<string, Profile | null>;
      userSubscribedToLoader: DataLoader<string, User[]>;
      subscribedToUserLoader: DataLoader<string, User[]>;
    };
  }

  fastify.route({
    url: '/',
    method: 'POST',
    schema: {
      ...createGqlResponseSchema,
      response: {
        200: gqlResponseSchema,
      },
    },
    async handler(req) {
      const { query, variables } = req.body;

      const loaders: Context['loaders'] = {
        userLoader: new DataLoader(async (userIds: readonly string[]) => {
          const users = await prisma.user.findMany({
            where: { id: { in: userIds as string[] } },
          });
          const usersById = groupBy(users, 'id');
          return userIds.map((id) => usersById[id]?.[0] || null);
        }),

        memberTypeLoader: new DataLoader(async (memberTypeIds: readonly string[]) => {
          const memberTypes = await prisma.memberType.findMany({
            where: { id: { in: memberTypeIds as string[] } },
          });
          const memberTypesById = groupBy(memberTypes, 'id');
          return memberTypeIds.map((id) => memberTypesById[id]?.[0] || null);
        }),

        postsByAuthorIdLoader: new DataLoader(async (authorIds: readonly string[]) => {
          const posts = await prisma.post.findMany({
            where: { authorId: { in: authorIds as string[] } },
          });
          const postsByAuthorId = groupBy(posts, 'authorId');
          return authorIds.map((authorId) => postsByAuthorId[authorId] || []);
        }),

        profileByUserIdLoader: new DataLoader(async (userIds: readonly string[]) => {
          const profiles = await prisma.profile.findMany({
            where: { userId: { in: userIds as string[] } },
          });
          const profilesByUserId = groupBy(profiles, 'userId');
          return userIds.map((userId) => profilesByUserId[userId]?.[0] || null);
        }),

        userSubscribedToLoader: new DataLoader(
          async (subscriberIds: readonly string[]) => {
            const subscriptions = await prisma.subscribersOnAuthors.findMany({
              where: { subscriberId: { in: subscriberIds as string[] } },
              include: { author: true },
            });
            const subscriptionsBySubscriberId = groupBy(subscriptions, 'subscriberId');
            return subscriberIds.map(
              (subscriberId) =>
                subscriptionsBySubscriberId[subscriberId]?.map((sub) => sub.author) || [],
            );
          },
        ),

        subscribedToUserLoader: new DataLoader(async (authorIds: readonly string[]) => {
          const subscriptions = await prisma.subscribersOnAuthors.findMany({
            where: { authorId: { in: authorIds as string[] } },
            include: { subscriber: true },
          });
          const subscriptionsByAuthorId = groupBy(subscriptions, 'authorId');
          return authorIds.map(
            (authorId) =>
              subscriptionsByAuthorId[authorId]?.map((sub) => sub.subscriber) || [],
          );
        }),
      };

      try {
        const validationErrors = validate(schema, parse(query), [depthLimit(5)]);
        if (validationErrors.length > 0) {
          return { errors: validationErrors };
        }
      } catch (error) {
        return { errors: [error] };
      }

      return graphql({
        schema,
        source: query,
        variableValues: variables,
        contextValue: { prisma, loaders },
      });
    },
  });
};

export default plugin;
