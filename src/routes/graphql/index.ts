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
} from 'graphql';
import { UUIDType } from './types/uuid.js';
import type { Post, Profile, User, SubscribersOnAuthors } from '@prisma/client';

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  // MemberType ID Enum
  const MemberTypeIdGQL = new GraphQLEnumType({
    name: 'MemberTypeId',
    values: {
      BASIC: { value: 'BASIC' },
      BUSINESS: { value: 'BUSINESS' },
    },
  });

  // Post
  const PostGQL = new GraphQLObjectType({
    name: 'Post',
    fields: () => ({
      id: { type: UUIDType },
      title: { type: GraphQLString },
      content: { type: GraphQLString },
      authorId: { type: UUIDType },
      author: {
        type: UserGQL as GraphQLObjectType,
        resolve: async (post: Post) =>
          await prisma.user.findUnique({ where: { id: post.authorId } }),
      },
    }),
  });

  // Profile
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
        resolve: async (profile: Profile) =>
          await prisma.user.findUnique({ where: { id: profile.userId } }),
      },
      memberType: {
        type: MemberTypeGQL,
        resolve: async (profile: Profile) =>
          await prisma.memberType.findUnique({ where: { id: profile.memberTypeId } }),
      },
    }),
  });

  // User
  const UserGQL = new GraphQLObjectType({
    name: 'User',
    fields: () => ({
      id: { type: UUIDType },
      name: { type: GraphQLString },
      balance: { type: GraphQLFloat },
      posts: {
        type: new GraphQLList(PostGQL),
        resolve: async (user: User) =>
          await prisma.post.findMany({ where: { authorId: user.id } }),
      },
      profile: {
        type: ProfileGQL as GraphQLObjectType,
        resolve: async (user: User) =>
          await prisma.profile.findUnique({ where: { userId: user.id } }),
      },
      userSubscribedTo: {
        type: new GraphQLList(UserGQL),
        resolve: async (user: User) => {
          const subscriptions = await prisma.subscribersOnAuthors.findMany({
            where: { subscriberId: user.id },
            include: { author: true },
          });
          return subscriptions.map(
            (sub: SubscribersOnAuthors & { author: User }) => sub.author,
          );
        },
      },
      subscribedToUser: {
        type: new GraphQLList(UserGQL),
        resolve: async (user: User) => {
          const subscriptions = await prisma.subscribersOnAuthors.findMany({
            where: { authorId: user.id },
            include: { subscriber: true },
          });
          return subscriptions.map(
            (sub: SubscribersOnAuthors & { subscriber: User }) => sub.subscriber,
          );
        },
      },
    }),
  });

  // MemberType
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

  const schema = new GraphQLSchema({
    query: RootQuery,
  });

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
      return graphql({
        schema,
        source: req.body.query,
        variableValues: req.body.variables,
        contextValue: { prisma },
      });
    },
  });
};

export default plugin;
