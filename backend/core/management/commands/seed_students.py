"""
Management command to seed realistic Indonesian students and enroll 7-12 students
into every ClassGroup in the Awan Topan Course system.
"""

from datetime import date
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import ClassGroup, Enrollment, Student

COHORT_STUDENTS = {
    "6 SD": [
        ("STD-06-001", "Jerome Polin", date(2014, 5, 2), "SDN 1 Ganung Kidul Nganjuk", "6 SD", "Bpk. Marojahan Sijabat", "081234560601"),
        ("STD-06-002", "Leonardo Edwin", date(2014, 8, 7), "SDN 1 Mangundikaran Nganjuk", "6 SD", "Bpk. Edwin Sukardi", "081234560602"),
        ("STD-06-003", "Gita Savitri Devi", date(2014, 2, 17), "SDN 1 Kauman Nganjuk", "6 SD", "Ibu Savitri Devi", "081234560603"),
        ("STD-06-004", "Zahid Azmi Ibrahim", date(2014, 11, 5), "SDN 2 Payaman Nganjuk", "6 SD", "Bpk. Azmi Ibrahim", "081234560604"),
        ("STD-06-005", "Danang Giri Sadewa", date(2014, 4, 30), "SDN 1 Sukomoro Nganjuk", "6 SD", "Bpk. Sadewa Giri", "081234560605"),
        ("STD-06-006", "Jehian Panangian", date(2014, 7, 19), "SDN 1 Ganung Kidul Nganjuk", "6 SD", "Bpk. Panangian Sijabat", "081234560606"),
        ("STD-06-007", "Belva Devara", date(2014, 9, 14), "SDN 1 Mangundikaran Nganjuk", "6 SD", "Bpk. Tri Harsono", "081234560607"),
        ("STD-06-008", "Iman Usman", date(2014, 1, 28), "SDN 1 Kauman Nganjuk", "6 SD", "Bpk. Usman Kasim", "081234560608"),
        ("STD-06-009", "Sabrina Anggraini", date(2014, 6, 8), "SDN 2 Payaman Nganjuk", "6 SD", "Ibu Anggraini", "081234560609"),
        ("STD-06-010", "Nadhira Nur Asyiqa", date(2014, 10, 25), "SDN 1 Sukomoro Nganjuk", "6 SD", "Ibu Nur Asyiqa", "081234560610"),
    ],
    "7A": [
        ("STD-07A-001", "Freya Jayawardana", date(2013, 2, 13), "SMPN 1 Nganjuk", "7 SMP", "Bpk. Jayawardana", "081234560701"),
        ("STD-07A-002", "Azizi Asadel", date(2013, 5, 16), "SMPN 2 Nganjuk", "7 SMP", "Bpk. Fadli Akhmad", "081234560702"),
        ("STD-07A-003", "Shania Gracia", date(2013, 8, 31), "SMPN 1 Nganjuk", "7 SMP", "Ibu Gracia", "081234560703"),
        ("STD-07A-004", "Feni Fitriyanti", date(2013, 1, 16), "SMPN 3 Nganjuk", "7 SMP", "Bpk. Fitriyanti", "081234560704"),
        ("STD-07A-005", "Angelina Christy", date(2013, 12, 5), "SMPN 2 Nganjuk", "7 SMP", "Ibu Christy", "081234560705"),
        ("STD-07A-006", "Mutiara Azzahra", date(2013, 7, 12), "SMPN 4 Nganjuk", "7 SMP", "Ibu Azzahra", "081234560706"),
        ("STD-07A-007", "Marsha Lenathea", date(2013, 1, 9), "SMPN 1 Sukomoro", "7 SMP", "Bpk. Lenathea", "081234560707"),
        ("STD-07A-008", "Kathrina Irene", date(2013, 9, 20), "SMPN 1 Nganjuk", "7 SMP", "Ibu Irene", "081234560708"),
        ("STD-07A-009", "Gita Sekar Andarini", date(2013, 6, 30), "SMPN 3 Nganjuk", "7 SMP", "Bpk. Andarini", "081234560709"),
        ("STD-07A-010", "Jesslyn Callista", date(2013, 4, 20), "SMPN 2 Nganjuk", "7 SMP", "Ibu Callista", "081234560710"),
    ],
    "7B": [
        ("STD-07B-001", "Melody Nurramdhani Laksani", date(2013, 3, 24), "SMPN 1 Nganjuk", "7 SMP", "Ibu Laksani", "081234560711"),
        ("STD-07B-002", "Nabilah Ratna Ayu", date(2013, 11, 11), "SMPN 2 Nganjuk", "7 SMP", "Ibu Ratna Ayu", "081234560712"),
        ("STD-07B-003", "Shania Junianatha", date(2013, 6, 27), "SMPN 3 Nganjuk", "7 SMP", "Ibu Junianatha", "081234560713"),
        ("STD-07B-004", "Jessica Veranda", date(2013, 8, 19), "SMPN 1 Nganjuk", "7 SMP", "Ibu Veranda", "081234560714"),
        ("STD-07B-005", "Haruka Nakagawa", date(2013, 2, 10), "SMPN 4 Nganjuk", "7 SMP", "Bpk. Nakagawa", "081234560715"),
        ("STD-07B-006", "Devi Kinal Putri", date(2013, 1, 2), "SMPN 2 Nganjuk", "7 SMP", "Ibu Kinal", "081234560716"),
        ("STD-07B-007", "Beby Chaesara Anadila", date(2013, 3, 18), "SMPN 1 Tanjunganom", "7 SMP", "Ibu Chaesara", "081234560717"),
        ("STD-07B-008", "Ayana Shahab", date(2013, 6, 3), "SMPN 3 Nganjuk", "7 SMP", "Bpk. Shahab", "081234560718"),
        ("STD-07B-009", "Stella Cornelia", date(2013, 11, 3), "SMPN 4 Nganjuk", "7 SMP", "Ibu Cornelia", "081234560719"),
        ("STD-07B-010", "Cindy Gulla", date(2013, 5, 29), "SMPN 1 Nganjuk", "7 SMP", "Ibu Gulla", "081234560720"),
    ],
    "8A": [
        ("STD-08A-001", "Iqbaal Ramadhan", date(2012, 12, 28), "SMPN 1 Nganjuk", "8 SMP", "Bpk. Herry Ramadhan", "081234560801"),
        ("STD-08A-002", "Angga Yunanda", date(2012, 5, 16), "SMPN 2 Nganjuk", "8 SMP", "Bpk. Muhammad Yunu", "081234560802"),
        ("STD-08A-003", "Shenina Cinnamon", date(2012, 2, 1), "SMPN 3 Nganjuk", "8 SMP", "Bpk. Harris Cinnamon", "081234560803"),
        ("STD-08A-004", "Jefri Nichol", date(2012, 1, 15), "SMPN 1 Nganjuk", "8 SMP", "Bpk. John Nichol", "081234560804"),
        ("STD-08A-005", "Adipati Dolken", date(2012, 8, 19), "SMPN 4 Nganjuk", "8 SMP", "Bpk. Didit Rukman", "081234560805"),
        ("STD-08A-006", "Chicco Kurniawan", date(2012, 10, 6), "SMPN 2 Nganjuk", "8 SMP", "Bpk. Kurniawan", "081234560806"),
        ("STD-08A-007", "Laura Basuki", date(2012, 1, 9), "SMPN 1 Nganjuk", "8 SMP", "Ibu Basuki", "081234560807"),
        ("STD-08A-008", "Mawar Eva de Jongh", date(2012, 9, 26), "SMPN 3 Nganjuk", "8 SMP", "Bpk. Bastian de Jongh", "081234560808"),
        ("STD-08A-009", "Bio One", date(2012, 1, 1), "SMPN 4 Nganjuk", "8 SMP", "Bpk. Praventia", "081234560809"),
        ("STD-08A-010", "Amanda Rawles", date(2012, 8, 25), "SMPN 2 Nganjuk", "8 SMP", "Bpk. Shane Rawles", "081234560810"),
        ("STD-08A-011", "Caitlin Halderman", date(2012, 7, 17), "SMPN 1 Bagor", "8 SMP", "Bpk. Frank Halderman", "081234560811"),
        ("STD-08A-012", "Ari Irham", date(2012, 10, 24), "SMPN 1 Nganjuk", "8 SMP", "Bpk. Herlan Joer", "081234560812"),
    ],
    "8B": [
        ("STD-08B-001", "Raditya Dika", date(2012, 12, 28), "SMPN 1 Nganjuk", "8 SMP", "Bpk. Joetje Nasution", "081234560813"),
        ("STD-08B-002", "Ernest Prakasa", date(2012, 1, 29), "SMPN 2 Nganjuk", "8 SMP", "Bpk. Wahyudi Prakasa", "081234560814"),
        ("STD-08B-003", "Dodit Mulyanto", date(2012, 6, 30), "SMPN 3 Nganjuk", "8 SMP", "Bpk. Mulyanto", "081234560815"),
        ("STD-08B-004", "Boris Bokir", date(2012, 5, 25), "SMPN 1 Nganjuk", "8 SMP", "Bpk. Manullang", "081234560816"),
        ("STD-08B-005", "Bintang Emon", date(2012, 5, 5), "SMPN 4 Nganjuk", "8 SMP", "Bpk. Emon", "081234560817"),
        ("STD-08B-006", "Indra Jegel", date(2012, 11, 5), "SMPN 2 Nganjuk", "8 SMP", "Bpk. Tarigan", "081234560818"),
        ("STD-08B-007", "Praz Teguh", date(2012, 6, 10), "SMPN 3 Nganjuk", "8 SMP", "Bpk. Teguh", "081234560819"),
        ("STD-08B-008", "Rigen Rakelna", date(2012, 11, 19), "SMPN 1 Loceret", "8 SMP", "Bpk. Rakelna", "081234560820"),
        ("STD-08B-009", "Kiky Saputri", date(2012, 10, 22), "SMPN 4 Nganjuk", "8 SMP", "Bpk. Aslih Nuro", "081234560821"),
        ("STD-08B-010", "Arie Kriting", date(2012, 4, 13), "SMPN 1 Nganjuk", "8 SMP", "Bpk. Kriting", "081234560822"),
        ("STD-08B-011", "Ge Pamungkas", date(2012, 1, 25), "SMPN 2 Nganjuk", "8 SMP", "Bpk. Pamungkas", "081234560823"),
    ],
    "9A": [
        ("STD-09A-001", "Nazril Irham", date(2011, 9, 16), "SMPN 1 Nganjuk", "9 SMP", "Bpk. Nazmul Irphan", "081234560901"),
        ("STD-09A-002", "Akhdiyat Duta Modjo", date(2011, 4, 30), "SMPN 2 Nganjuk", "9 SMP", "Bpk. Hakam S. Modjo", "081234560902"),
        ("STD-09A-003", "Akhadi Wira Satriaji", date(2011, 4, 6), "SMPN 3 Nganjuk", "9 SMP", "Ibu Bunda Iffet", "081234560903"),
        ("STD-09A-004", "Bimo Setiawan Almachzumi", date(2011, 9, 22), "SMPN 1 Nganjuk", "9 SMP", "Ibu Bunda Iffet", "081234560904"),
        ("STD-09A-005", "Elfonda Mekel", date(2011, 5, 21), "SMPN 4 Nganjuk", "9 SMP", "Bpk. Mekel", "081234560905"),
        ("STD-09A-006", "Armand Maulana", date(2011, 4, 4), "SMPN 2 Nganjuk", "9 SMP", "Bpk. Tubagus Maulana", "081234560906"),
        ("STD-09A-007", "Eross Candra", date(2011, 7, 3), "SMPN 1 Nganjuk", "9 SMP", "Bpk. Candra", "081234560907"),
        ("STD-09A-008", "Ian Kasela", date(2011, 9, 17), "SMPN 3 Nganjuk", "9 SMP", "Bpk. Kasela", "081234560908"),
        ("STD-09A-009", "Mohammad Istiqamah Djamad", date(2011, 1, 24), "SMPN 4 Nganjuk", "9 SMP", "Bpk. Djamad", "081234560909"),
        ("STD-09A-010", "Sigit Wardana", date(2011, 5, 26), "SMPN 2 Nganjuk", "9 SMP", "Bpk. Wardana", "081234560910"),
        ("STD-09A-011", "Rian Ekky Pradipta", date(2011, 11, 17), "MTsN 1 Nganjuk", "9 SMP", "Bpk. Daniel Rian", "081234560911"),
        ("STD-09A-012", "Donnie Sibarani", date(2011, 4, 17), "SMPN 1 Nganjuk", "9 SMP", "Bpk. Sibarani", "081234560912"),
    ],
    "9B": [
        ("STD-09B-001", "Raisa Andriana", date(2011, 6, 6), "SMPN 1 Nganjuk", "9 SMP", "Bpk. Allan Rachman", "081234560913"),
        ("STD-09B-002", "Isyana Sarasvati", date(2011, 5, 2), "SMPN 2 Nganjuk", "9 SMP", "Ibu Luana Marpanda", "081234560914"),
        ("STD-09B-003", "Maudy Ayunda", date(2011, 12, 19), "SMPN 3 Nganjuk", "9 SMP", "Ibu Muren Jasmedi", "081234560915"),
        ("STD-09B-004", "Tiara Andini", date(2011, 9, 23), "SMPN 1 Nganjuk", "9 SMP", "Bpk. Nugroho", "081234560916"),
        ("STD-09B-005", "Lyodra Ginting", date(2011, 6, 21), "SMPN 4 Nganjuk", "9 SMP", "Bpk. Simar Ginting", "081234560917"),
        ("STD-09B-006", "Ziva Magnolya", date(2011, 3, 14), "SMPN 2 Nganjuk", "9 SMP", "Bpk. Stevanus Magnolya", "081234560918"),
        ("STD-09B-007", "Mahalini Raharja", date(2011, 3, 4), "SMPN 1 Tanjunganom", "9 SMP", "Bpk. I Gede Suraharja", "081234560919"),
        ("STD-09B-008", "Yura Yunita", date(2011, 6, 9), "SMPN 3 Nganjuk", "9 SMP", "Bpk. Rachman", "081234560920"),
        ("STD-09B-009", "Nadin Amizah", date(2011, 5, 28), "SMPN 4 Nganjuk", "9 SMP", "Ibu Intan Gurnita", "081234560921"),
        ("STD-09B-010", "Rossa Roslaina", date(2011, 10, 9), "SMPN 1 Nganjuk", "9 SMP", "Ibu Eni Witarsih", "081234560922"),
        ("STD-09B-011", "Sal Priadi", date(2011, 4, 30), "SMPN 2 Nganjuk", "9 SMP", "Bpk. Priadi", "081234560923"),
    ],
    "10A": [
        ("STD-10A-001", "Taufik Hidayat", date(2010, 8, 10), "SMAN 1 Nganjuk", "10 SMA", "Bpk. Aris Hadis", "081234561001"),
        ("STD-10A-002", "Anthony Sinisuka Ginting", date(2010, 10, 20), "SMAN 2 Nganjuk", "10 SMA", "Bpk. Edison Ginting", "081234561002"),
        ("STD-10A-003", "Jonatan Christie", date(2010, 9, 15), "SMAN 1 Nganjuk", "10 SMA", "Bpk. Andreas Adi", "081234561003"),
        ("STD-10A-004", "Greysia Polii", date(2010, 8, 11), "SMAN 3 Nganjuk", "10 SMA", "Ibu Evie Pakasi", "081234561004"),
        ("STD-10A-005", "Apriyani Rahayu", date(2010, 4, 29), "SMKN 1 Nganjuk", "10 SMA", "Bpk. Ameruddin", "081234561005"),
        ("STD-10A-006", "Hendra Setiawan", date(2010, 8, 25), "SMAN 2 Nganjuk", "10 SMA", "Bpk. Ferry Yoegianto", "081234561006"),
        ("STD-10A-007", "Mohammad Ahsan", date(2010, 9, 7), "SMAN 1 Nganjuk", "10 SMA", "Bpk. Tumin", "081234561007"),
        ("STD-10A-008", "Marcus Fernaldi Gideon", date(2010, 3, 9), "SMAN 3 Nganjuk", "10 SMA", "Bpk. Kurniahu Gideon", "081234561008"),
        ("STD-10A-009", "Kevin Sanjaya Sukamuljo", date(2010, 8, 2), "SMAN 2 Nganjuk", "10 SMA", "Bpk. Sugiarto Sukamuljo", "081234561009"),
        ("STD-10A-010", "Susi Susanti", date(2010, 2, 11), "SMAN 1 Nganjuk", "10 SMA", "Bpk. Risad Haditono", "081234561010"),
        ("STD-10A-011", "Alan Budikusuma", date(2010, 3, 29), "SMKN 1 Nganjuk", "10 SMA", "Bpk. Trisna Wiratama", "081234561011"),
        ("STD-10A-012", "Gregoria Mariska Tunjung", date(2010, 8, 11), "SMAN 2 Nganjuk", "10 SMA", "Bpk. Gregorius Maryanto", "081234561012"),
    ],
    "10B": [
        ("STD-10B-001", "Pramoedya Ananta Toer", date(2010, 2, 6), "SMAN 1 Nganjuk", "10 SMA", "Bpk. M. Toer", "081234561013"),
        ("STD-10B-002", "Chairil Anwar", date(2010, 7, 26), "SMAN 2 Nganjuk", "10 SMA", "Bpk. Toeloes", "081234561014"),
        ("STD-10B-003", "Sapardi Djoko Damono", date(2010, 3, 20), "SMAN 3 Nganjuk", "10 SMA", "Bpk. S. Kasbyo", "081234561015"),
        ("STD-10B-004", "Willibrordus Surendra Rendra", date(2010, 11, 7), "SMAN 1 Nganjuk", "10 SMA", "Bpk. R.B. Brotoatmodjo", "081234561016"),
        ("STD-10B-005", "Taufiq Ismail", date(2010, 6, 25), "MAN 1 Nganjuk", "10 SMA", "Bpk. A. Gaffar Ismail", "081234561017"),
        ("STD-10B-006", "Nh Dini", date(2010, 2, 28), "SMAN 2 Nganjuk", "10 SMA", "Bpk. S. Prawirodihardjo", "081234561018"),
        ("STD-10B-007", "Ahmad Tohari", date(2010, 6, 13), "MAN 2 Nganjuk", "10 SMA", "Bpk. Tohari", "081234561019"),
        ("STD-10B-008", "Mochtar Lubis", date(2010, 3, 7), "SMAN 1 Nganjuk", "10 SMA", "Bpk. M. Lubis", "081234561020"),
        ("STD-10B-009", "Sitor Situmorang", date(2010, 10, 2), "SMAN 3 Nganjuk", "10 SMA", "Bpk. O.P. Situmorang", "081234561021"),
        ("STD-10B-010", "Sutardji Calzoum Bachri", date(2010, 6, 24), "SMAN 2 Nganjuk", "10 SMA", "Bpk. M. Bachri", "081234561022"),
        ("STD-10B-011", "Dee Lestari", date(2010, 1, 20), "SMAN 1 Nganjuk", "10 SMA", "Bpk. Yohan Simangunsong", "081234561023"),
    ],
    "11A": [
        ("STD-11A-001", "Jenderal Soedirman", date(2009, 1, 24), "SMAN 1 Nganjuk", "11 SMA", "Bpk. Karsid Kartawiuraji", "081234561101"),
        ("STD-11A-002", "Pangeran Diponegoro", date(2009, 11, 11), "SMAN 2 Nganjuk", "11 SMA", "Bpk. Sultan Hamengkubuwono III", "081234561102"),
        ("STD-11A-003", "Kapitan Pattimura", date(2009, 6, 8), "SMAN 3 Nganjuk", "11 SMA", "Bpk. Frans Matulessy", "081234561103"),
        ("STD-11A-004", "Sultan Hasanuddin", date(2009, 1, 12), "SMAN 1 Nganjuk", "11 SMA", "Bpk. Sultan Malikussaid", "081234561104"),
        ("STD-11A-005", "Tuanku Imam Bonjol", date(2009, 1, 1), "SMKN 2 Nganjuk", "11 SMA", "Bpk. Bayanuddin", "081234561105"),
        ("STD-11A-006", "Cut Nyak Dien", date(2009, 5, 12), "SMAN 2 Nganjuk", "11 SMA", "Bpk. Teuku Nanta Seutia", "081234561106"),
        ("STD-11A-007", "Bung Tomo", date(2009, 10, 3), "SMAN 1 Nganjuk", "11 SMA", "Bpk. Kartawan Tjiptowidjojo", "081234561107"),
        ("STD-11A-008", "Martha Christina Tiahahu", date(2009, 1, 4), "SMAN 3 Nganjuk", "11 SMA", "Bpk. Paulus Tiahahu", "081234561108"),
        ("STD-11A-009", "I Gusti Ngurah Rai", date(2009, 1, 30), "SMAN 2 Nganjuk", "11 SMA", "Bpk. I Gusti Ngurah Palgruna", "081234561109"),
        ("STD-11A-010", "Teuku Umar", date(2009, 8, 15), "SMAN 1 Nganjuk", "11 SMA", "Bpk. Teuku Mahmud", "081234561110"),
        ("STD-11A-011", "Nyai Ahmad Dahlan", date(2009, 1, 3), "SMKN 2 Nganjuk", "11 SMA", "Bpk. K.H. Muhammad Fadhlil", "081234561111"),
    ],
    "11B": [
        ("STD-11B-001", "Abdurrahman Wahid", date(2009, 8, 4), "SMAN 1 Nganjuk", "11 SMA", "Bpk. K.H. Wahid Hasyim", "081234561112"),
        ("STD-11B-002", "Buya Hamka", date(2009, 2, 17), "MAN 1 Nganjuk", "11 SMA", "Bpk. H. Abdul Karim Amrullah", "081234561113"),
        ("STD-11B-003", "Emha Ainun Nadjib", date(2009, 5, 27), "SMAN 2 Nganjuk", "11 SMA", "Bpk. M.A. Latif", "081234561114"),
        ("STD-11B-004", "Sujiwo Tejo", date(2009, 8, 31), "SMAN 1 Nganjuk", "11 SMA", "Bpk. Soedarmadji", "081234561115"),
        ("STD-11B-005", "Butet Kartaredjasa", date(2009, 11, 21), "SMAN 3 Nganjuk", "11 SMA", "Bpk. Bagong Kussudiardja", "081234561116"),
        ("STD-11B-006", "Goenawan Mohamad", date(2009, 7, 29), "SMAN 2 Nganjuk", "11 SMA", "Bpk. Mohamad", "081234561117"),
        ("STD-11B-007", "Raden Pandji Soeroso", date(2009, 11, 3), "SMAN 1 Nganjuk", "11 SMA", "Bpk. Soeroso", "081234561118"),
        ("STD-11B-008", "Umar Kayam", date(2009, 4, 30), "SMAN 3 Nganjuk", "11 SMA", "Bpk. Sastrosoedharmo", "081234561119"),
        ("STD-11B-009", "Djaduk Ferianto", date(2009, 7, 19), "SMAN 2 Nganjuk", "11 SMA", "Bpk. Bagong Kussudiardja", "081234561120"),
        ("STD-11B-010", "Arswendo Atmowiloto", date(2009, 11, 26), "SMAN 1 Nganjuk", "11 SMA", "Bpk. Atmowiloto", "081234561121"),
    ],
    "12": [
        ("STD-12-001", "Bacharuddin Jusuf Habibie", date(2008, 6, 25), "SMAN 1 Nganjuk", "12 SMA", "Bpk. Alwi Abdul Jalil Habibie", "081234561201"),
        ("STD-12-002", "Khoirul Anwar", date(2008, 8, 22), "SMAN 2 Nganjuk", "12 SMA", "Bpk. Sudjiarto", "081234561202"),
        ("STD-12-003", "Warsito Purwo Taruno", date(2008, 5, 15), "SMAN 1 Nganjuk", "12 SMA", "Bpk. Purwo Taruno", "081234561203"),
        ("STD-12-004", "Carina Joe", date(2008, 4, 21), "SMAN 3 Nganjuk", "12 SMA", "Bpk. Joe", "081234561204"),
        ("STD-12-005", "Yogi Ahmad Erlangga", date(2008, 3, 2), "SMKN 1 Nganjuk", "12 SMA", "Bpk. Erlangga", "081234561205"),
        ("STD-12-006", "Josaphat Tetuko Sri Sumantyo", date(2008, 6, 25), "SMAN 2 Nganjuk", "12 SMA", "Bpk. Sri Sumantyo", "081234561206"),
        ("STD-12-007", "Eniya Listiani Dewi", date(2008, 6, 14), "SMAN 1 Nganjuk", "12 SMA", "Bpk. Listiani", "081234561207"),
        ("STD-12-008", "Adi Rahman Adiwoso", date(2008, 7, 26), "SMAN 3 Nganjuk", "12 SMA", "Bpk. Adiwoso", "081234561208"),
        ("STD-12-009", "Meisak Chrisanto", date(2008, 12, 18), "SMAN 2 Nganjuk", "12 SMA", "Bpk. Chrisanto", "081234561209"),
        ("STD-12-010", "Ken Kawan Soetanto", date(2008, 1, 1), "SMAN 1 Nganjuk", "12 SMA", "Bpk. Soetanto", "081234561210"),
        ("STD-12-011", "Yudi Utomo Imardjoko", date(2008, 3, 15), "SMAN 3 Nganjuk", "12 SMA", "Bpk. Imardjoko", "081234561211"),
        ("STD-12-012", "Tjokorda Raka Sukawati", date(2008, 5, 3), "SMKN 1 Nganjuk", "12 SMA", "Bpk. Sukawati", "081234561212"),
    ],
}

# Room mapping for class groups to display beautifully in UI
ROOM_MAPPING = {
    "6 SD": "Ruang Alpha",
    "7A": "Ruang 101",
    "7B": "Ruang 102",
    "8A": "Ruang 103",
    "8B": "Ruang Beta",
    "9A": "Ruang 201",
    "9B": "Ruang 202",
    "10A": "Ruang 203",
    "10B": "Ruang Gamma",
    "11A": "Ruang 301",
    "11B": "Ruang 302",
    "12": "Ruang Audiovisual",
}


class Command(BaseCommand):
    help = "Seed realistic students and enroll 7-12 students into every active ClassGroup"

    def add_arguments(self, parser):
        parser.add_argument("--database", default="default", help="Database alias to use")

    def handle(self, *args, **options):
        db = options["database"]

        self.stdout.write("=" * 80)
        self.stdout.write(" SEEDER MURID DAN ENROLLMENT (7-12 SISWA PER KELAS)")
        self.stdout.write("=" * 80)

        with transaction.atomic(using=db):
            # 1. Create or update Students by cohort
            cohort_student_objs = {}
            total_students_created = 0
            for cohort_key, student_list in COHORT_STUDENTS.items():
                cohort_student_objs[cohort_key] = []
                for sid, name, bdate, school, grade, pname, pphone in student_list:
                    student, created = Student.objects.using(db).update_or_create(
                        student_id=sid,
                        defaults={
                            "full_name": name,
                            "birth_date": bdate,
                            "school": school,
                            "grade": grade,
                            "parent_name": pname,
                            "parent_phone": pphone,
                            "status": Student.Status.ACTIVE,
                        },
                    )
                    cohort_student_objs[cohort_key].append(student)
                    if created:
                        total_students_created += 1

            self.stdout.write(f"[1] Berhasil memproses {len(COHORT_STUDENTS)} kohort murid ({total_students_created} baru dibuat).")

            # 2. Assign room names and enroll 7-12 students into every ClassGroup
            all_cgs = ClassGroup.objects.using(db).filter(is_active=True)
            self.stdout.write(f"\n[2] Menghubungkan murid ke {all_cgs.count()} Rombel (ClassGroup)...")

            for cg in all_cgs:
                # Assign nice room name
                room_assigned = ROOM_MAPPING.get(cg.name, "Ruang 101")
                if cg.room != room_assigned:
                    cg.room = room_assigned
                    cg.save(update_fields=["room"])

                # Determine cohort to enroll
                cohort_key = cg.name
                students_to_enroll = cohort_student_objs.get(cohort_key)

                if not students_to_enroll:
                    # Fallback for baseline like 11-MAT-A or any other cohort
                    if "11" in cg.name:
                        students_to_enroll = cohort_student_objs.get("11A", [])[:9]
                    else:
                        students_to_enroll = cohort_student_objs.get("10A", [])[:8]

                # Enroll students (between 7 and 12)
                for st in students_to_enroll:
                    Enrollment.objects.using(db).get_or_create(
                        student=st,
                        class_group=cg,
                        defaults={
                            "joined_at": date(2026, 7, 15),
                            "is_active": True,
                        },
                    )

            # 3. Final Validation
            self.stdout.write("\n" + "=" * 80)
            self.stdout.write(" HASIL VALIDASI ENROLLMENT PER KELAS")
            self.stdout.write("=" * 80)
            all_valid = True
            for cg in all_cgs.order_by("name", "subject__name"):
                count = cg.students.filter(enrollment__is_active=True).count()
                is_valid = 7 <= count <= 12
                if not is_valid:
                    all_valid = False
                status_str = "SESUAI" if is_valid else "TIDAK SESUAI"
                self.stdout.write(f" - Kelas {cg.name:8} ({cg.subject.name:20}) | Ruang: {cg.room:15} | Jumlah Siswa: {count:2} -> {status_str}")

            self.stdout.write("=" * 80)
            if all_valid:
                self.stdout.write(self.style.SUCCESS(" SEMUA KELAS TERVERIFIKASI BERISI 7-12 SISWA!"))
            else:
                self.stdout.write(self.style.ERROR(" ADA KELAS DENGAN JUMLAH SISWA DI LUAR RANGE 7-12!"))
            self.stdout.write("=" * 80)
