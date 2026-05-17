FROM alpine:3.20.3
RUN apk add --no-cache curl tzdata ca-certificates
COPY run.sh /run.sh
RUN chmod +x /run.sh
ENV TZ=Europe/Bucharest
ENTRYPOINT ["/bin/sh", "/run.sh"]
