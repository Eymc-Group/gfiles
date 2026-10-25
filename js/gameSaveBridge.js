(function () {
    "use strict";

    function requestToPromise(request) {
        return new Promise(
            function (resolve, reject) {
                request.onsuccess =
                    function () {
                        resolve(
                            request.result
                        );
                    };

                request.onerror =
                    function () {
                        reject(
                            request.error ||
                            new Error(
                                "IndexedDB request failed."
                            )
                        );
                    };
            }
        );
    }

    function transactionToPromise(transaction) {
        return new Promise(
            function (resolve, reject) {
                transaction.oncomplete =
                    function () {
                        resolve();
                    };

                transaction.onerror =
                    function () {
                        reject(
                            transaction.error
                        );
                    };

                transaction.onabort =
                    function () {
                        reject(
                            transaction.error
                        );
                    };
            }
        );
    }

    function openDatabase(name, version) {
        return new Promise(
            function (resolve, reject) {
                const request =
                    indexedDB.open(
                        name,
                        version
                    );

                request.onsuccess =
                    function () {
                        resolve(
                            request.result
                        );
                    };

                request.onerror =
                    function () {
                        reject(
                            request.error
                        );
                    };
            }
        );
    }

    async function exportIndexedDB() {
        if (
            !indexedDB.databases ||
            typeof indexedDB.databases !==
                "function"
        ) {
            return [];
        }

        const databaseList =
            await indexedDB.databases();

        const exported = [];

        for (
            const databaseInfo of
            databaseList
        ) {
            if (!databaseInfo.name) {
                continue;
            }

            let database;

            try {
                database =
                    await openDatabase(
                        databaseInfo.name,
                        databaseInfo.version
                    );

                const stores = [];

                for (
                    const storeName of
                    Array.from(
                        database.objectStoreNames
                    )
                ) {
                    const transaction =
                        database.transaction(
                            storeName,
                            "readonly"
                        );

                    const store =
                        transaction.objectStore(
                            storeName
                        );

                    const keys =
                        await requestToPromise(
                            store.getAllKeys()
                        );

                    const values =
                        await requestToPromise(
                            store.getAll()
                        );

                    await transactionToPromise(
                        transaction
                    );

                    stores.push({
                        name:
                            store.name,
                        keyPath:
                            store.keyPath,
                        autoIncrement:
                            store.autoIncrement,
                        records:
                            values.map(
                                function (
                                    value,
                                    index
                                ) {
                                    return {
                                        key:
                                            keys[index],
                                        value
                                    };
                                }
                            )
                    });
                }

                exported.push({
                    name:
                        database.name,
                    version:
                        database.version,
                    stores
                });

            } finally {
                if (database) {
                    database.close();
                }
            }
        }

        return exported;
    }

    function exportLocalStorage() {
        const data = {};

        for (
            let index = 0;
            index < localStorage.length;
            index += 1
        ) {
            const key =
                localStorage.key(index);

            if (key) {
                data[key] =
                    localStorage.getItem(
                        key
                    );
            }
        }

        return data;
    }

    async function exportSave() {
        return {
            localStorage:
                exportLocalStorage(),

            indexedDB:
                await exportIndexedDB()
        };
    }

    async function importSave(saveData) {
        if (
            saveData &&
            saveData.localStorage &&
            typeof saveData.localStorage ===
                "object"
        ) {
            localStorage.clear();

            for (
                const [key, value] of
                Object.entries(
                    saveData.localStorage
                )
            ) {
                if (
                    typeof value === "string"
                ) {
                    localStorage.setItem(
                        key,
                        value
                    );
                }
            }
        }

        /*
         * IndexedDB import requires each game’s exact schema.
         * LocalStorage games work immediately with this bridge.
         * Database restoration can be specialized for games that
         * use IndexedDB after their database structure is inspected.
         */

        return true;
    }

    window.addEventListener(
        "message",
        async function (event) {
            const message =
                event.data;

            if (
                !message ||
                message.source !==
                    "workstudy-parent" ||
                typeof message.requestId !==
                    "string"
            ) {
                return;
            }

            try {
                if (
                    message.type ===
                    "WORKSTUDY_EXPORT_SAVE"
                ) {
                    const saveData =
                        await exportSave();

                    event.source.postMessage(
                        {
                            source:
                                "workstudy-game",
                            requestId:
                                message.requestId,
                            success: true,
                            saveData
                        },
                        event.origin
                    );
                }

                if (
                    message.type ===
                    "WORKSTUDY_IMPORT_SAVE"
                ) {
                    await importSave(
                        message.payload
                            .saveData
                    );

                    event.source.postMessage(
                        {
                            source:
                                "workstudy-game",
                            requestId:
                                message.requestId,
                            success: true
                        },
                        event.origin
                    );
                }

            } catch (error) {
                event.source.postMessage(
                    {
                        source:
                            "workstudy-game",
                        requestId:
                            message.requestId,
                        success: false,
                        error:
                            error.message ||
                            "Game-save request failed."
                    },
                    event.origin
                );
            }
        }
    );
})();
