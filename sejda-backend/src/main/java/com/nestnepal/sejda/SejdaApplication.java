package com.nestnepal.sejda;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Boot entry-point for the Sejda PDF service.
 *
 * Default port 8089 (set in application.properties). Override with
 * --server.port=NNN or the PORT env var.
 *
 * CORS is wide-open by default so the Vite dev server (localhost:8080)
 * and any production frontend host can call in without a separate
 * config. Tighten via SEJDA_ALLOWED_ORIGIN if/when you put this behind
 * an auth wall.
 */
@SpringBootApplication
public class SejdaApplication {

    public static void main(String[] args) {
        SpringApplication.run(SejdaApplication.class, args);
    }

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        String allowed = System.getenv().getOrDefault("SEJDA_ALLOWED_ORIGIN", "*");
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOriginPatterns(allowed)
                        .allowedMethods("GET", "POST", "OPTIONS")
                        .allowedHeaders("*")
                        .exposedHeaders("Content-Disposition")
                        .maxAge(3600);
            }
        };
    }
}
