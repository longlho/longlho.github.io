---
date: 2026-06-12
---

# React Compiler Is A Retrofit

React Compiler solves a real problem: React creates a lot of identity churn, and manual `useMemo`, `useCallback`, and `memo` are noisy and easy to get wrong.

I still do not like it as a default.

The issue is not "compiler bad." The issue is that React is adding compiler-shaped optimization after the runtime model, API surface, and ecosystem patterns already hardened. That makes the compiler feel less like the foundation of the framework and more like a compatibility layer recovering information the model did not preserve.

## Memoization Is Not Free Semantics

Memoization is not just a performance hint. It changes identity.

```tsx
const options = useMemo(() => {
  return buildOptions(user, flags);
}, [user]);
```

That code looks harmless until `flags` changes and the memoized value does not. Or until a callback closes over stale state. Or until one child wants referential equality and another path accidentally treats stable identity as stable data.

React Compiler is better than blindly adding `useMemo` everywhere, but it does not remove the semantic issue. It moves the cache into generated code.

The compiler still has to decide which values keep identity, which values recompute, and which expressions are pure enough to reuse. Clean React code gives it room. Mutation, render-time side effects, unstable object identity, or weird third-party hooks force bailouts or make behavior harder to reason about.

## Bundle Size Is Part Of Performance

React Compiler mostly targets update performance: fewer child renders, fewer repeated calculations, fewer callback identity changes.

That can be valuable. It also spends JavaScript to get there. In our monorepo, turning it on bumps bundle size by close to 20%. That is not a rounding error.

For surfaces already dominated by JS delivery and hydration, trading load cost for possible update wins needs evidence, not a global switch.

## The Direction Feels Backwards

Svelte and Solid did not start with a huge runtime API and then bolt a compiler onto it years later. Their compiler story is part of the contract: syntax, reactivity, generated output, and runtime expectations were designed together.

```mermaid
flowchart LR
  contract["Compiler-aware contract"] --> compiler["Compiler"]
  compiler --> runtime["Small runtime"]
  runtime --> app["Application"]
```

React is stuck preserving a massive ecosystem built around plain JavaScript components, hooks, dependency arrays, referential equality, context, effects, refs, external stores, and third-party hooks.

That is why the rollout story needs directives, gating, compatibility targets, lints, panic thresholds, and escape hatches. Those tools are reasonable. They also show the compiler negotiating with an API it did not get to design.

React Compiler is not expressing the core programming model. It is inferring a better one from code written for the old model.

## Papering Over The Runtime

React makes rendering look like calling functions. Components run, values are recreated, closures are rebuilt, children reconcile, and then we patch around the cost with memoization.

The compiler makes that cheaper by proving which churn did not matter. That is useful, but it is still design debt paid with generated code.

Svelte and Solid know which values are reactive because the model says so. React Compiler has to discover that after the fact.

## What I Would Trust

I would not treat React Compiler as a default switch for a large app. I would trust it more as a linter: let it surface places where identity churn or missed memoization matters, then have an agent or human make the change and verify the diff.

That is why the [OXC React Compiler plugin work](https://github.com/oxc-project/oxc/issues/10048#issuecomment-4043223690) is interesting to me. A fast lint-shaped pass feels like a healthier adoption path than turning on global compilation and hoping the generated code is right.

If I used it for compilation, I would keep the contract narrow:

- enable it where profiling shows update work is the bottleneck
- track bundle size per route before and after
- keep strong lint rules around purity, hooks, refs, and effects
- make opt-outs boring and well documented
- avoid relying on compiler output for API or library contracts
- keep explicit memoization where identity is part of the product behavior

Measure the problem, apply the tool, verify the trade, and keep the boundary visible.

## The Practical Line

React Compiler is serious engineering. It is probably useful. It may become normal React.

I still do not like what it says about the framework direction: optimize a runtime model that was not designed around a compiler, hide manual memoization behind generated machinery, and infer intent that compiler-first frameworks encode directly.

Use it where the numbers say it helps. Do not pretend memoization disappeared. And do not confuse "the compiler can patch over this" with "the model is clean."

## References

- [React Compiler introduction](https://react.dev/learn/react-compiler/introduction)
- [React Compiler configuration](https://react.dev/reference/react-compiler/configuration)
- [React Compiler directives](https://react.dev/reference/react-compiler/directives)
- [OXC React Compiler plugin discussion](https://github.com/oxc-project/oxc/issues/10048#issuecomment-4043223690)
