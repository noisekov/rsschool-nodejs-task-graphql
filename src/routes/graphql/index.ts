import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import {
  graphql,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';
import type { MemberType } from '@prisma/client';

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  const MemberType = new GraphQLObjectType({
    name: 'MemberType',
    fields: {
      id: { type: GraphQLString },
      discount: { type: GraphQLFloat },
      postsLimitPerMonth: { type: GraphQLInt },
    },
  });

  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'MemberTypes',
      fields: {
        memberTypes: {
          type: new GraphQLList(MemberType),
          resolve: async (): Promise<MemberType[]> => await prisma.memberType.findMany(),
        },
      },
    }),
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
        source: `query { memberTypes { id discount postsLimitPerMonth } }`,
        variableValues: req.body.variables,
        contextValue: { prisma },
      });
    },
  });
};

export default plugin;
