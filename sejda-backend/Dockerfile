# Two-stage build — fat JAR baked into a slim JRE runtime.
# Render / Railway / Fly.io all detect this Dockerfile automatically.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
# Pre-fetch deps to leverage Docker layer cache on subsequent builds.
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/target/sejda-backend-*.jar /app/app.jar
# Render injects $PORT; we fall through to 8089 locally.
EXPOSE 8089
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
