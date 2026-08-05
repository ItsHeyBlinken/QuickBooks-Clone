# Technical Architecture: Intelligent, Offline-First Data Import

## 1. Introduction

The "Intelligent, Offline-First Data Import" feature is designed to automate the categorization of financial transactions without relying on cloud-based services. This architecture leverages a tiered approach: a high-priority **Deterministic Rule Engine** followed by a **Probabilistic Machine Learning Classifier**. This ensures both absolute control for the user and intelligent automation for new or ambiguous data.

## 2. Architectural Overview

The system operates as a pipeline within the desktop application, processing raw transaction files (OFX, QIF, CSV) through several layers of refinement.

| Layer | Component | Purpose | Priority |
| :--- | :--- | :--- | :--- |
| **Layer 1** | **User-Defined Rules** | Explicit "If-Then" logic defined by the user. | Highest |
| **Layer 2** | **Fuzzy Match Engine** | SQLite FTS5 matching for known vendors with slight name variations. | Medium |
| **Layer 3** | **Local ML Classifier** | Naive Bayes model trained on historical local data. | Lowest (Suggestion) |

## 3. Component Details

### 3.1. Data Ingestion & Parsing
The application uses specialized Python libraries to parse common financial formats into a standardized internal `Transaction` object.
*   **Libraries**: `ofxparse` for OFX/QFX files, `quiffen` for QIF files, and a custom `csv` handler for generic bank exports.
*   **Normalization**: Raw descriptions are cleaned (e.g., removing transaction IDs, dates, and special characters) to improve matching accuracy.

### 3.2. Deterministic Rule Engine
The rule engine allows users to create explicit logic for high-frequency vendors.
*   **Logic Model**: Rules are stored as JSON objects in the local SQLite database.
*   **Example Rule**:
    ```json
    {
      "id": "rule_001",
      "criteria": {
        "description_contains": "STARBUCKS",
        "amount_range": [-20.00, 0]
      },
      "action": {
        "category_id": "cat_meals_entertainment",
        "vendor_name": "Starbucks"
      }
    }
    ```
*   **Execution**: When a file is imported, the engine iterates through active rules. The first rule that matches a transaction "claims" it, preventing further processing.

### 3.3. Fuzzy Match Engine (SQLite FTS5)
To handle minor variations in bank descriptions (e.g., "WAL-MART #1234" vs "WALMART"), the system utilizes **SQLite FTS5 (Full-Text Search)**.
*   **Implementation**: A virtual table stores historical `(Description, Category)` pairs.
*   **Query**: The system performs a `MATCH` query using the new transaction description. If a high-confidence match is found in the history, the category is suggested.

### 3.4. Probabilistic ML Classifier (Naive Bayes)
For transactions that don't match explicit rules or historical entries, a local **Multinomial Naive Bayes** model provides a best-guess suggestion.
*   **Why Naive Bayes?**: It is extremely lightweight, fast to train on small datasets (local history), and works exceptionally well for text classification with minimal memory overhead.
*   **Training**: The model is retrained locally whenever the user confirms a categorization. No data ever leaves the machine.
*   **Library**: `scikit-learn` (specifically `MultinomialNB`) or a custom pure-Python implementation for even lower overhead.

## 4. User Workflow & "Learning" Loop

The system is designed to "learn" from every user action without being intrusive.

1.  **Import**: User selects a file.
2.  **Auto-Process**: The system applies rules and FTS5 matches. These are marked as "Confident."
3.  **Suggest**: For remaining items, the ML model provides a "Suggested" category.
4.  **Review UI**: The user sees a list where confident matches are pre-filled, and suggestions are highlighted.
5.  **Confirmation**:
    *   If the user clicks "Approve," the transaction is saved.
    *   If the user corrects a category, the system asks: *"Would you like to create a rule for this vendor?"*
6.  **Retraining**: Upon saving, the local ML model is updated with the new `(Description -> Category)` mapping.

## 5. Security & Privacy

*   **Zero External Calls**: All parsing, matching, and ML inference happen within the local application process.
*   **Local Persistence**: Rules, historical data, and the ML model weights are stored in the application's local database file (`.db`).
*   **Encryption**: The entire SQLite database can be encrypted using **SQLCipher**, ensuring that even if the computer is compromised, the financial rules and history remain private.

## 6. Implementation Strategy for a Web Developer

Since you are comfortable with HTML/CSS/JS and basic Python, this architecture is highly achievable:
*   **Electron (Frontend)**: Build the "Review & Approve" UI using React or Vue.
*   **Python (Backend)**: Use Python for the heavy lifting (parsing, rule execution, and ML).
*   **IPC Communication**: Use Electron's `ipcMain` and `ipcRenderer` to send raw file paths to Python and receive categorized transaction objects back.
*   **Database**: Use `sqlite3` in Python to manage rules and transaction history.

## 7. Conclusion

This architecture provides a robust, "intelligent" experience that rivals cloud competitors while strictly adhering to your offline-first security requirement. By combining explicit rules with a learning ML model, the app becomes more efficient the more it is used, creating a high-value experience for the end user.

## 8. References

[1] scikit-learn. (n.d.). 1.9. Naive Bayes. [https://scikit-learn.org/stable/modules/naive_bayes.html](https://scikit-learn.org/stable/modules/naive_bayes.html)
[2] SQLite. (2025). SQLite FTS5 Extension. [https://www.sqlite.org/fts5.html](https://www.sqlite.org/fts5.html)
[3] Sergey Koskov. (n.d.). A Rule Engine for Payment Systems. Medium. [https://medium.com/@skoskov/a-rule-engine-for-payment-systems-54b78825feef](https://medium.com/@skoskov/a-rule-engine-for-payment-systems-54b78825feef)
[4] PyPI. (n.d.). ofxparse. [https://pypi.org/project/ofxparse/](https://pypi.org/project/ofxparse/)
[5] Quiffen. (n.d.). Parsing QIF Files to Retrieve Financial Data with Python. [https://towardsdatascience.com/parsing-qif-files-to-retrieve-financial-data-with-python-f599cc0d8c03/](https://towardsdatascience.com/parsing-qif-files-to-retrieve-financial-data-with-python-f599cc0d8c03/)
