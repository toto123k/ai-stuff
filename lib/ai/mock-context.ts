import { AsyncLocalStorage } from 'node:async_hooks';

interface MockContext {
    selectedFiles: unknown[];
}

export const mockContextStorage = new AsyncLocalStorage<MockContext>();

export const getMockContext = () => {
    return mockContextStorage.getStore();
};

export const runWithMockContext = <T>(context: MockContext, fn: () => T): T => {
    return mockContextStorage.run(context, fn);
};
