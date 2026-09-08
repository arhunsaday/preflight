---
id: testing-pattern
trigger: 'when writing unit tests for a service or other DI-wired class'
confidence: 0.8
domain: testing
source: hand-authored
---

# Mock at the collaborator boundary with typed mocks, colocated with the source

> **Stack-flavored.** The rules below are general; the snippet is NestJS +
> `jest-mock-extended`. Replace it with the equivalent for your stack and keep
> the four rules.

## Action

- **Mock at the injection boundary, not inside the unit.** Replace the
  collaborators the container would provide (repository, logger, HTTP client),
  and let the class under test run its real logic.
- **Use typed mocks.** A mock that does not track the real interface keeps
  passing after you change that interface — the test survives the regression it
  existed to catch.
- **Declare fixtures as constants at the top of the file**, not inline in each
  assertion, so the expected shape is stated once.
- **Colocate the spec next to its source** (`foo.service.ts` →
  `foo.service.spec.ts`). A test that lives far from its subject gets missed when
  the subject moves.

```typescript
import { Test, type TestingModule } from '@nestjs/testing';
import { mock } from 'jest-mock-extended';

describe('FooService', () => {
  let service: FooService;
  const mockRepo = mock<FooRepository>();
  const mockLogger = mock<AppLogger>();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FooService,
        { provide: FooRepository, useValue: mockRepo },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(FooService);
  });

  it('returns the mapped entity', async () => {
    mockRepo.findOne.mockResolvedValue(fixture);
    expect(await service.getOne('id')).toEqual(expected);
  });
});
```

If the framework wraps methods in decorators that need a live context
(transactions, caching, retries), stub the decorator module in the spec — those
belong to integration tests, not unit tests.

## Why

Tests that reach past the injection boundary end up asserting on the framework
rather than on your logic: they break when the framework moves and stay green
when your logic breaks. Typed mocks and single-source fixtures keep the test
coupled to the contract instead of to the implementation.
