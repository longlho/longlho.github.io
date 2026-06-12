---
date: 2026-06-12
---

# React Compiler Is A Retrofit

React Compiler has a good sales pitch.

React apps re-render too much. Manual `useMemo`, `useCallback`, and `memo` are noisy. Most teams do not want every feature diff to include a small dependency-array negotiation. A compiler that removes that work sounds nice.

I still do not like the direction.

The problem is not "compilers are bad." The problem is that React is trying to add compiler-shaped performance after the runtime model, API surface, and ecosystem patterns already hardened. That makes the compiler feel less like the foundation of the framework and more like a compatibility layer trying to recover information the model did not preserve.

## Memoization Is Not Free Semantics

Manual memoization is easy to get wrong because it is not just a performance hint. It changes identity.

```tsx
const options = useMemo(() => {
  return buildOptions(user, flags);
}, [user]);
```

That code looks harmless until `flags` changes and the memoized value does not. Or until a callback closes over a stale value. Or until a value is kept stable because one child wants referential equality, while another part of the tree accidentally treats that stability as meaning the underlying data did not change.

The bug is usually not dramatic. It is quieter than that.

The common response is "that is exactly why React Compiler exists." Instead of humans manually wrapping things, the compiler can decide what to cache.

That is better than blindly adding `useMemo` everywhere.

But it does not remove the semantic issue. It moves the issue into a generated layer.

The compiler still has to decide which values should keep identity, which values should be recomputed, and which expressions are safe to treat as pure. If the source code is clean React code, that can work. If the code leans on mutation, render-time side effects, unstable object identity, or third-party hooks with weird behavior, the compiler either has to bail out or produce code whose behavior is harder for a human to reason about.

That is the awkward part. React Compiler is marketed as getting rid of manual memoization, but the underlying model still depends on memoization being valid. The cache moved. The tradeoff did not disappear.

## Bundle Size Is Part Of Performance

Most React Compiler examples focus on update performance: fewer child renders, fewer repeated calculations, fewer callback identity changes.

That is a real performance axis.

It is not the only one.

If the compiler adds cache slots, guards, temporaries, helper calls, or more generated control flow across a large app, that cost shows up in the JavaScript payload. More JavaScript means more bytes to download, parse, compile, and execute before the user can interact with the page.

That can still be a good trade. A dense app with expensive update paths may gladly pay a few more bytes to avoid repeated work. A dashboard with stable shell UI and expensive tables may benefit. A component library with careful rollout might benefit.

But it is not automatically a win.

In our monorepo, turning it on bumps the bundle size by close to 20%. That is not a rounding error.

For many product surfaces, the performance budget is already dominated by JavaScript delivery and hydration. If the compiler makes every route slightly heavier to make some interactions cheaper, that is not free optimization. It is moving cost from update time to load time.

React Compiler may improve one performance budget while spending another. That is a trade, not a magic refund.

## The Direction Feels Backwards

The deeper issue is architectural.

Svelte and Solid did not start with a huge runtime API and then bolt a compiler onto it years later. Their compiler story is part of the contract. The syntax, reactivity model, generated output, and runtime expectations were designed together.

```mermaid
flowchart LR
  contract["Compiler-aware contract"] --> compiler["Compiler"]
  compiler --> runtime["Small runtime"]
  runtime --> app["Application"]
```

React is in a different position.

React already has a massive ecosystem built around plain JavaScript components, hooks, dependency arrays, referential equality, object identity, context propagation, effects, refs, external stores, third-party hooks, and a long tail of patterns that may be legal but not compiler-friendly.

So React Compiler has to work around the existing contract.

That shape has a cost. The compiler cannot freely say, "the model is changing, update your code." It has to preserve the old mental model while recovering enough structure to optimize it.

That is why the rollout story needs directives, gating, compatibility targets, lints, panic thresholds, and escape hatches. Those are reasonable tools. They are also evidence that the compiler is negotiating with an API it did not get to design.

This is the backwards part.

The compiler is not expressing the core programming model. It is trying to infer a better one from code written for the old model.

## Papering Over The Runtime

React's core model makes rendering look like calling functions. Components run, values are recreated, closures are rebuilt, children are reconciled, and then we patch around the cost with memoization.

The compiler tries to make that cheaper.

But a lot of the pain comes from the model itself: too much reactive intent is implicit. A value is recreated because JavaScript does that. A callback changes identity because closures do that. An effect reruns because a dependency changed identity. A child rerenders because its parent rerendered. Then the compiler comes in later and tries to prove which of those things did not matter.

Svelte and Solid start from a more explicit reactive contract. They know which values are reactive because the model says so. React Compiler has to discover that after the fact.

That does not mean React Compiler cannot work. It probably will work well for a lot of code.

It does mean the approach feels like paying down a design debt with generated code.

## What I Would Trust

I would not treat React Compiler as a default switch for a large app.

I would trust it more as a linter: let it surface places where identity churn or missed memoization matters, then have an agent or human make the change and verify the diff.

That is why the [OXC React Compiler plugin work](https://github.com/oxc-project/oxc/issues/10048#issuecomment-4043223690) is interesting to me. A fast lint-shaped pass feels like a healthier adoption path than turning on global compilation and hoping the generated code is right.

I would trust it under a narrower contract:

- enable it where profiling shows update work is the bottleneck
- track bundle size per route before and after
- keep strong lint rules around purity, hooks, refs, and effects
- make opt-outs boring and well documented
- avoid relying on compiler output for API or library contracts
- keep explicit memoization where identity is part of the product behavior

That is less exciting than "the compiler handles it."

It is also closer to how I want performance work to behave. Measure the problem, apply the tool, verify the trade, and keep the boundary visible.

## The Practical Line

React Compiler is a serious piece of engineering. It is probably useful. It may become the normal way to write React.

I still do not like what it says about the direction of the framework.

The compiler is trying to optimize a runtime model that was not designed around it. It hides manual memoization by generating more machinery. It can improve update performance by spending bundle budget. It has to infer intent that compiler-first frameworks get to encode directly.

That is the trade.

Use it where the numbers say it helps. Do not pretend it makes memoization disappear. And do not confuse "the compiler can patch over this" with "the model is clean."

## References

- [React Compiler introduction](https://react.dev/learn/react-compiler/introduction)
- [React Compiler configuration](https://react.dev/reference/react-compiler/configuration)
- [React Compiler directives](https://react.dev/reference/react-compiler/directives)
- [OXC React Compiler plugin discussion](https://github.com/oxc-project/oxc/issues/10048#issuecomment-4043223690)
