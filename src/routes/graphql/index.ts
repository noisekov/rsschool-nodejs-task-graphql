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
} from 'graphql';
import { UUIDType } from './types/uuid.js';

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  // MemberType
  const MemberTypeGQL = new GraphQLObjectType({
    name: 'MemberType',
    fields: {
      id: { type: GraphQLString },
      discount: { type: GraphQLFloat },
      postsLimitPerMonth: { type: GraphQLInt },
    },
  });

  // Post
  const PostGQL = new GraphQLObjectType({
    name: 'Post',
    fields: {
      id: { type: UUIDType },
      title: { type: GraphQLString },
      content: { type: GraphQLString },
      authorId: { type: UUIDType },
    },
  });

  // Profile
  const ProfileGQL = new GraphQLObjectType({
    name: 'Profile',
    fields: {
      id: { type: UUIDType },
      isMale: { type: GraphQLBoolean },
      yearOfBirth: { type: GraphQLInt },
      memberTypeId: { type: GraphQLString },
      userId: { type: UUIDType },
    },
  });

  // User
  const UserGQL = new GraphQLObjectType({
    name: 'User',
    fields: {
      id: { type: UUIDType },
      name: { type: GraphQLString },
      balance: { type: GraphQLFloat },
    },
  });

  const RootQuery = new GraphQLObjectType({
    name: 'RootQueryType',
    fields: {
      memberTypes: {
        type: new GraphQLList(MemberTypeGQL),
        resolve: async () => await prisma.memberType.findMany(),
      },
      posts: {
        type: new GraphQLList(PostGQL),
        resolve: async () => await prisma.post.findMany(),
      },
      profiles: {
        type: new GraphQLList(ProfileGQL),
        resolve: async () => await prisma.profile.findMany(),
      },
      users: {
        type: new GraphQLList(UserGQL),
        resolve: async () => await prisma.user.findMany(),
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
