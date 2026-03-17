# Runtime Stack Contract

<!-- This file defines the runtime stack for the project.
     Consumed by run-uat to boot services, seed data, and verify readiness.
     Auto-generated during milestone planning from detected project structure.
     Each H3 under ## Services defines one service with startup and readiness config.
     Bold fields: Command, Ready when, Port, Health URL, Readiness delay. -->

**Project:** {{projectName}}

## Environment

- {{KEY}}={{value}}

## Services

### {{serviceName}}

**Command:** {{startupCommand}}
**Ready when:** {{readinessExpression}}
**Port:** {{portNumber}}
**Health URL:** {{healthCheckUrl}}
**Readiness delay:** {{delayMs}}ms

## Seed

1. {{seed step}}

## Preview URLs

- {{name}}: {{url}}

## Teardown

1. {{teardown step}}
