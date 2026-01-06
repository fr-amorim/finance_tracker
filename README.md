# Portfolio Tracker 📈

A modern portfolio tracking application built with Next.js, PostgreSQL, and Prisma. It features incremental fetching from Yahoo Finance and persistent caching to minimize API hits.

---

## 🚀 Getting Started

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 20+](https://nodejs.org/) (for local development only)

---

## 🐳 Option 1: Running with Docker Compose (Fully Containerized)

This is the recommended way to run the app in a consistent environment.

1. **Start the application**:
   ```bash
   docker compose up --build
   ```
   *The first run will automatically install dependencies, set up the database schema, and generate the Prisma client.*

2. **Access the App**:
   👉 [http://localhost:3000](http://localhost:3000)

3. **Stop the application**:
   ```bash
   docker compose down
   ```
   *Note: Use `docker compose down --volumes` if you want to completely reset the database.*

---

## 💻 Option 2: Local Development (Hyper-Fast Feedback)

Best for active coding. Runs the Next.js app on your host machine but uses the PostgreSQL database inside Docker.

1. **Setup Environment**:
   Create a `.env` file in the root directory:
   ```text
   DATABASE_URL="postgresql://user:password@localhost:5432/portfolio_db"
   ```

2. **Start the Database only**:
   ```bash
   docker compose up -d db
   ```

3. **Install Dependencies and Generate Client**:
   ```bash
   npm install
   npx prisma generate
   ```

4. **Run the App**:
   ```bash
   npm run dev
   ```

5. **Access the App**:
   👉 [http://localhost:3000](http://localhost:3000)

---

## 🔍 Database Inspection

### Prisma Studio (Visual GUI)
The easiest way to view and edit your data.
- **In Docker**: `docker compose exec web npx prisma studio` (open [http://localhost:5555](http://localhost:5555))
- **Locally**: `npx prisma studio`

### External Client (DBeaver / TablePlus)
- **Host**: `localhost`
- **Port**: `5432`
- **User**: `user` / **Pass**: `password`
- **Database**: `portfolio_db`

---

## 📥 Bulk Transaction Import

You can now import transactions in bulk using an Excel (`.xlsx`, `.xls`) or CSV file.

### Expected File Structure
The file should have the following headers (case-insensitive):

| Column | Description | Mandatory |
| :--- | :--- | :--- |
| **Ticker** | Asset symbol (e.g., `AAPL`, `BTC-USD`) | Yes |
| **Type** | `BUY` or `SELL` | Yes |
| **Quantity** | Number of units purchased/sold | Yes |
| **Date** | Transaction date (YYYY-MM-DD) | No (defaults to earliest price) |
| **Class** | Asset category (e.g., `Stocks`, `Crypto`) | No |

An example file `example_import.csv` is provided in the root directory.

---

## 🛠️ Architecture Notes

- **Caching Strategy**: The app uses a `SyncRegistry` table to track the last successful API check. Markets are only queried once per day per ticker.
- **Incremental Fetching**: The API identifies the latest record in the DB and only requests the "delta" from Yahoo Finance.
- **Persistence**: Database data is stored in the `postgres_data` Docker volume and survives container restarts.
