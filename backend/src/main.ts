import 'reflect-metadata';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module';
import { auth } from './auth/auth';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Note: helmet CSP would break the Swagger UI bundle; the API serves JSON,
  // so we keep all other helmet headers and disable CSP only.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  // Middleware registered here runs BEFORE the Nest router (mounted at listen):
  // Better Auth owns /api/auth/*, Swagger owns /docs*. Nest routes handle the rest.
  // (The session check lives at GET /api/session/me so it is never shadowed.)
  const server = app.getHttpAdapter().getInstance();
  server.use('/api/auth', toNodeHandler(auth));

  const config = new DocumentBuilder()
    .setTitle('NextStride API')
    .setDescription(
      'AI-powered priority decision assistant. AI recommends, user decides, backend records.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`NextStride API listening on :${port} (docs at /docs)`);
}
void bootstrap();
